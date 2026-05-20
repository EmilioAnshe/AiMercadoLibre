import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not defined. AI features will require configuration or return simulated errors.");
}

const ai = new GoogleGenAI({
  apiKey: apiKey || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Helper function to check compliance via Regex and basic heuristic
function performRuleCheck(text: string): { ruleId: string; ruleName: string; severity: "high" | "medium"; message: string; detectedText?: string }[] {
  const issues: { ruleId: string; ruleName: string; severity: "high" | "medium"; message: string; detectedText?: string }[] = [];
  const textLower = text.toLowerCase();

  // 1. Telephone Numbers & WhatsApp (high risk of suspensions)
  const phoneRegex = /(?:\+?54\s?)?(?:9\s?)?(?:11|[23]\d{2})\s?\d{4}[-\s]?\d{4}|\d{2}[-\s]?\d{8}|\b(?:\d[\s-]?){7,11}\d\b/;
  const hasPhone = phoneRegex.test(textLower) || /\b(wsp|whatsapp|celular|cel|fono|telefono|tel|teléfono|contactame|escribime al|llamar al)\b/i.test(text);
  if (hasPhone) {
    const match = text.match(phoneRegex);
    issues.push({
      ruleId: "RULE_CONTACT_PHONE",
      ruleName: "Prohibición de Datos de Contacto (Teléfono/WhatsApp)",
      severity: "high",
      message: "Mercado Libre prohíbe compartir teléfonos, números de celular o referencias directas a WhatsApp en preguntas/respuestas.",
      detectedText: match ? match[0] : "Palabra clave de contacto telefónico detectada"
    });
  }

  // 2. Identity & Taxes (CUIL, CUIT, DNI)
  const cuitRegex = /\b\d{2}[-]?\d{8}[-]?\d{1}\b/;
  const dniRegex = /\b\d{7,8}\b/;
  if (cuitRegex.test(textLower) || /\b(cuil|cuit|clave cbu|dni)\b/i.test(text)) {
    const match = text.match(cuitRegex);
    issues.push({
      ruleId: "RULE_IDENTITY_TAX",
      ruleName: "Datos Personales o Impositivos (CUIT/CUIL/DNI)",
      severity: "high",
      message: "Mercado Libre prohíbe solicitar o compartir números de CUIT, CUIL, DNI o CBU antes de la compra para evitar robo de identidad y transacciones paralelas.",
      detectedText: match ? match[0] : "Término fiscal/identidad detectado"
    });
  }

  // 3. URLs, Web Pages & Links
  const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)+(com|net|org|ar|cl|co|mx|uy|store|page|online|site|cc|info)\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi;
  if (urlRegex.test(textLower) || /\b(http|https|www|punto com|link|enlace|pagina web|página web|web|sitio)\b/i.test(text)) {
    const match = text.match(urlRegex);
    issues.push({
      ruleId: "RULE_EXTERNAL_LINKS",
      ruleName: "Enlaces o Direcciones Web Externas",
      severity: "high",
      message: "No se puede sugerir o colocar enlaces a sitios web externos a la plataforma de Mercado Libre.",
      detectedText: match ? match[0] : "Referencia a enlaces web detectada"
    });
  }

  // 4. Social Media References
  const instagramRegex = /@\w+/;
  if (instagramRegex.test(textLower) || /\b(instagram|ig|insta|face|facebook|fb|redes|tiktok|tok|twitter|x\.com)\b/i.test(text)) {
    const match = text.match(instagramRegex);
    issues.push({
      ruleId: "RULE_SOCIAL_MEDIA",
      ruleName: "Mención de Redes Sociales",
      severity: "high",
      message: "No se permite derivar a compradores a redes sociales como Instagram, TikTok o Facebook.",
      detectedText: match ? match[0] : "Términos de redes sociales detectados"
    });
  }

  // 5. Payment Methods outside Mercado Libre
  if (/\b(efectivo contra entrega|efectivo al retirar|transferencia directa|transferencia bancaria|cbu|cvu|descuento por fuera|al contado en efectivo|por fuera)\b/i.test(textLower)) {
    issues.push({
      ruleId: "RULE_PAYMENT_OUTSIDE",
      ruleName: "Métodos de Pago Fuera de Mercado Libre",
      severity: "high",
      message: "Ofrecer descuentos por fuera de la plataforma o invitar a pagar en efectivo mediante transferencias directas viola los términos de servicio.",
      detectedText: "Mención de forma de pago externa"
    });
  }

  // 6. Address / Exact Location pre-sale
  if (/\b(calle\s+[a-zA-Z]+|avenida\s+[a-zA-Z]+|es en la esquina de|nuestro local queda en|avenida de mayo|av\.\s+[a-zA-Z]+|local nro|piso \d+|altura \d+)\b/i.test(textLower)) {
    issues.push({
      ruleId: "RULE_EXACT_LOCATION",
      ruleName: "Ubicación o Dirección Exacta",
      severity: "high",
      message: "No está permitido detallar direcciones exactas (calle, número) de locales o domicilios antes de que el comprador realice el pago.",
      detectedText: "Patrón de dirección exacta detectado"
    });
  }

  // 7. General contact phrases or trigger words
  if (/\b(buscanos como|encontranos como|googleanos|buscame|googleame|coordinamos por fuera|arreglamos directo)\b/i.test(textLower)) {
    issues.push({
      ruleId: "RULE_CONTACT_TRICK",
      ruleName: "Evadir Canales de Venta Oficiales",
      severity: "high",
      message: "Invitar al comprador a 'buscar en Google' al vendedor o coordinar de forma directa antes de la compra puede causar la suspensión permanente de la cuenta.",
      detectedText: "Término para evadir el canal"
    });
  }

  return issues;
}

// Function to sanitize any text matching high-risk violation issues for safety
function sanitizeLocalText(text: string): string {
  let sanitized = text;
  
  // Replace anything resembling a phone number
  const phonePattern = /(?:\+?54\s?)?(?:9\s?)?(?:11|[23]\d{2})\s?\d{4}[-\s]?\d{4}|\d{2}[-\s]?\d{8}|\b(?:\d[\s-]?){7,11}\d\b/g;
  sanitized = sanitized.replace(phonePattern, "[TELÉFONO RESTRINGIDO POR MERCADO LIBRE]");

  // Replace fiscal CUIT
  const cuitPattern = /\b\d{2}[-]?\d{8}[-]?\d{1}\b/g;
  sanitized = sanitized.replace(cuitPattern, "[CUIT RESTRINGIDO]");

  // Replace DNI
  const dniPattern = /\b\d{7,8}\b/g;
  sanitized = sanitized.replace(dniPattern, "[DOCUMENTO RESTRINGIDO]");

  // Replace links
  const urlPattern = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)+(com|net|org|ar|cl|co|mx|uy|store|page|online|site|cc|info)\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/gi;
  sanitized = sanitized.replace(urlPattern, "[ENLACE RESTRINGIDO]");

  // Clean specific trigger words
  sanitized = sanitized.replace(/@\w+/g, "[USUARIO RESTRINGIDO]");
  
  return sanitized;
}

// 1. API: Check Compliance
app.post("/api/check-compliance", async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "El texto para el análisis es requerido." });
      return;
    }

    // Heuristics Check / Regex
    const regexIssues = performRuleCheck(text);

    // AI Check
    let aiFindings: { ruleId: string; ruleName: string; severity: "high" | "medium"; message: string; detectedText: string }[] = [];
    let isCompiledIssuesCompliant = regexIssues.length === 0;

    if (apiKey) {
      try {
        const prompt = `Analiza el siguiente texto de un vendedor para Mercado Libre y determina si infringe las políticas de Mercado Libre (prohibición estricta de compartir o pedir datos de contacto directo, teléfono, WhatsApp, CUIL/CUIT, DNI, cuentas bancarias, redes sociales, links externos, direcciones exactas de locales físicos antes de la compra, o coordinar pagos/descuentos por fuera). 

Texto a analizar:
"${text}"

Devuelve un JSON estrictamente estructurado siguiendo este esquema:
{
  "issues": [
    {
      "ruleId": "RULE_CONTACT_COMPLIANCE | RULE_PAYMENT_COMPLIANCE | RULE_SOCIAL_COMPLIANCE | RULE_LOCATION_COMPLIANCE",
      "ruleName": "Nombre descriptivo de la regla",
      "severity": "high" o "medium",
      "message": "Explicación de por qué infringe y qué política viola",
      "detectedText": "La frase o fragmento exacto que viola la regla"
    }
  ]
}`;

        const aiResponse = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                issues: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      ruleId: { type: Type.STRING },
                      ruleName: { type: Type.STRING },
                      severity: { type: Type.STRING },
                      message: { type: Type.STRING },
                      detectedText: { type: Type.STRING },
                    },
                    required: ["ruleId", "ruleName", "severity", "message", "detectedText"],
                  }
                }
              },
              required: ["issues"]
            }
          }
        });

        if (aiResponse.text) {
          const result = JSON.parse(aiResponse.text.trim());
          if (result.issues) {
            aiFindings = result.issues;
          }
        }
      } catch (aiError) {
        console.error("AI Compliance Check Error:", aiError);
      }
    }

    // Merge issues, prioritize unique ruleIds
    const mergedIssuesMap = new Map();
    regexIssues.forEach(issue => mergedIssuesMap.set(issue.ruleId, issue));
    aiFindings.forEach(issue => mergedIssuesMap.set(issue.ruleId, issue));

    const allIssues = Array.from(mergedIssuesMap.values());
    const isCompliant = allIssues.length === 0;

    // Scoring
    let score = 100;
    allIssues.forEach(issue => {
      if (issue.severity === "high") {
        score -= 40;
      } else {
        score -= 15;
      }
    });
    score = Math.max(0, score);

    res.json({
      isCompliant,
      issues: allIssues,
      score,
      sanitizedText: sanitizeLocalText(text)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Error al verificar cumplimiento" });
  }
});

// 2. API: Auto-Respond Question
app.post("/api/generate-reply", async (req: Request, res: Response) => {
  try {
    const { question, product, faqs } = req.body;

    if (!question || !product) {
      res.status(400).json({ error: "Faltan datos de pregunta o producto." });
      return;
    }

    const { title, description, characteristics, category } = product;

    // Filter FAQs that match keywords in the question
    const faqsText = faqs && Array.isArray(faqs)
      ? faqs.map((f: any) => `Categoría: ${f.category}\nPregunta: ${f.question}\nRespuesta: ${f.answer}`).join("\n---\n")
      : "No hay preguntas frecuentes configuradas.";

    const specsText = characteristics && Array.isArray(characteristics)
      ? characteristics.map((char: any) => `- ${char.key}: ${char.value}`).join("\n")
      : "No hay especificaciones específicas.";

    // Analyze if the question violates rules (i.e. Buyer trying to solicit phone, etc)
    const questionAnalysis = performRuleCheck(question);
    const buyerAttemptedViolation = questionAnalysis.length > 0;

    // AI formulation using GEMINI
    let aiResponseText = "";
    let systemInstruction = `Eres un asistente de ventas automático inteligente y experto para Mercado Libre. Tu objetivo principal es responder de manera amable, profesional, precisa y 100% segura (siguiendo estrictamente las políticas de Mercado Libre) a la pregunta de un comprador.

INFORMACIÓN DEL PRODUCTO:
- Título: ${title}
- Categoría: ${category}
- Especificaciones Técnicas:
${specsText}
- Descripción del Producto:
"${description}"

PREGUNTAS FRECUENTES (FAQs) ADICIONALES DEL VENDEDOR:
${faqsText}

NORMAS CRÍTICAS DE MERCADO LIBRE (100% OBLIGATORIO):
1. NUNCA propongas o indiques canales de contacto externos (No des números telefónicos, no des números de celular, no menciones WhatsApp, redes sociales, ni sugieras 'buscanos en redes').
2. NUNCA brindes tu dirección exacta, ni calle, ni piso, ni indicaciones exactas antes de que realicen la compra. Está permitido decir la zona aproximada (ej. "Estamos en Palermo, cerca de Plaza Italia") y el horario del local.
3. NUNCA solicites ni proveas CUIL, CUIT, DNI, datos de cuentas bancarias, CBU o CVU en la sección de preguntas.
4. NUNCA ofrezcas descuentos por fuera de la plataforma ni formas de pago externas a Mercado Pago (ej: "si pagas con transferencia te hago un descuentito" o "efectivo al retirar").
5. Si el comprador solicita datos prohibidos, indícale de manera amigable que por políticas de Mercado Libre no es posible compartirlos antes de concretar la compra.

Si la pregunta tiene que ver con Envíos, Garantía, o Facturación y encuentras una FAQ relevante, úsala de prioridad. Responde de forma concisa y directa pero con tono de venta excelente. No inventes características del producto que no estén descritas.`;

    if (apiKey) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `Pregunta del Comprador: "${question}"`,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.3, // reduce creativity for factual responses
          }
        });

        aiResponseText = response.text || "Lo siento, no pude formular una respuesta.";
      } catch (aiError) {
        console.error("Gemini Generate Content error:", aiError);
        aiResponseText = `Hola! Muchas gracias por consultar. De acuerdo a las características de nuestro ${title}, cuenta con características descritas excelentes. Estamos en la zona y contamos con stock disponible. Esperamos tu compra!`;
      }
    } else {
      // Offline fallback
      aiResponseText = `Hola! Muchas gracias por tu pregunta. Respecto de tu consulta sobre ${title}: el producto cuenta con las características descriptas en la publicación. Quedamos a tu entera disposición para cualquier otra consulta. ¡Esperamos tu oferta!`;
    }

    // Pass AI response through safety review
    const aiIssues = performRuleCheck(aiResponseText);
    const sanitizedAnswer = sanitizeLocalText(aiResponseText);

    res.json({
      rawQuestion: question,
      aiResponse: sanitizedAnswer,
      confidence: 95,
      complianceReport: {
        isCompliant: aiIssues.length === 0,
        issues: aiIssues,
        score: Math.max(0, 100 - (aiIssues.length * 30)),
        sanitizedText: sanitizedAnswer
      },
      sourcesUsed: {
        productDetailsUsed: true,
        faqUsed: faqs ? faqs.filter((f: any) => question.toLowerCase().includes(f.category.toLowerCase())).map((f: any) => f.question) : []
      },
      buyerSafetyWarning: buyerAttemptedViolation ? "¡Atención! El comprador parece estar intentando solicitar datos restringidos por Mercado Libre (teléfonos, datos presenciales). Evita a toda costa responder con tus datos personales." : null
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message || "Error procesando la simulación." });
  }
});

// 3. API: Optimize Description
app.post("/api/optimize-description", async (req: Request, res: Response) => {
  try {
    const { title, description, characteristics, category } = req.body;

    if (!title) {
      res.status(400).json({ error: "El título es requerido para la optimización." });
      return;
    }

    const specsText = characteristics && Array.isArray(characteristics)
      ? characteristics.map((char: any) => `- ${char.key}: ${char.value}`).join("\n")
      : "No hay especificaciones.";

    // AI formulation using GEMINI with strict guidelines
    let optimizedText = "";
    if (apiKey) {
      try {
        const prompt = `Actúa como un redactor publicitario senior experto en optimización SEO y técnicas de venta (Copywriting) exclusivamente enfocado en Mercado Libre Hispanoamérica. 

Tu trabajo es optimizar la descripción del siguiente producto para aumentar drásticamente su tasa de conversión, resolver dudas preventas frecuentes y estructurarla de manera profesional, amigable y muy legible.

DATOS ORIGINALES:
- Título: ${title}
- Categoría: ${category}
- Características técnicas originales:
${specsText}
- Descripción original:
"${description || ""}"

INSTRUCCIONES DE DISEÑO DE CONTENIDO Y CUMPLIMIENTO:
1. Divide la descripción en secciones laras:
   - Resumen introductorio con gancho de venta (los beneficios principales del producto).
   - Características destacadas paso a paso.
   - Especificaciones Técnicas estructuradas con viñetas.
   - Preguntas urgentes (Garantía, Tipo de factura emitida, Envíos).
2. Utiliza una tipografía de texto limpia con separadores visuales claros como guiones ("---") para dar aire al texto y que sea cómodo de leer en teléfonos móviles.
3. CUMPLIMIENTO DEL 100% DE LAS NORMAS DE MERCADO LIBRE:
   - NO incluyas ninguna referencia impositiva prohibida (como solicitar CUIL/CUIT o condicionar contra entrega).
   - NO indiques enlaces a tiendas, redes sociales, direcciones físicas exactas, números de teléfono ni correos electrónicos.
   - Mantén los textos completamente libres de cualquier violación que suspenda la publicación de Mercado Libre.

Escribe la respuesta en formato de texto plano listo para copiar y pegar en la descripción de Mercado Libre.`;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            temperature: 0.7,
          }
        });

        optimizedText = response.text || "Error generando la optimización.";
      } catch (aiError) {
        console.error("Gemini Optimize error:", aiError);
        optimizedText = `¡Optimización estándar para: ${title}!\n\n${description}\n\nEspecificaciones:\n${specsText}`;
      }
    } else {
      optimizedText = `🚀 **Descripción Optimizada para ${title}** 🚀\n\n¡Consigue los mejores estándares de calidad con nuestro nuevo producto! Diseñado especialmente para tus necesidades diarias dentro de la categoría ${category}.\n\n📌 **BENEFICIOS DESTACADOS**\n- Entrega inmediata asegurada por Mercado Envíos.\n- Producto con garantía oficial de fábrica.\n- Emitimos Facturas A y B según tus datos fiscales precargados.\n\n🛠️ **ESPECIFICACIONES TÉCNICAS**:\n${specsText}\n\n---\n*Nota: De acuerdo a las políticas de Mercado Libre, no compartimos enlaces externos ni datos de contacto directo antes de la compra.*`;
    }

    // Clean generated output for safety
    optimizedText = sanitizeLocalText(optimizedText);

    res.json({
      optimizedDescription: optimizedText,
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message || "Error al optimizar la descripción" });
  }
});

// --- MERCADO LIBRE REAL OAUTH & API INTEGRATION ---
app.get("/api/meli/auth-url", (req: Request, res: Response) => {
  const site = (req.query.site as string) || "MLA"; // MLA, MLB, MLM, etc.
  const clientId = process.env.MELI_CLIENT_ID;
  
  if (!clientId) {
    res.json({
      configured: false,
      message: "MELI_CLIENT_ID no configurado en el servidor."
    });
    return;
  }

  // Construct Mercado Libre auth URL according to site (Argentina, Mexico, Brazil, etc.)
  let authDomain = "auth.mercadolibre.com.ar";
  if (site === "MLM") authDomain = "auth.mercadolibre.com.mx";
  if (site === "MLB") authDomain = "auth.mercadolibre.com.br";
  if (site === "MLC") authDomain = "auth.mercadolibre.cl";
  if (site === "MCO") authDomain = "auth.mercadolibre.com.co";
  if (site === "MLU") authDomain = "auth.mercadolibre.com.uy";

  const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
  const mliUrl = `https://${authDomain}/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  res.json({
    configured: true,
    url: mliUrl,
    redirectUri
  });
});

app.get("/auth/callback", async (req: Request, res: Response) => {
  const { code } = req.query;
  const clientId = process.env.MELI_CLIENT_ID;
  const clientSecret = process.env.MELI_CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #f3f4f6; color: #1f2937;">
          <h2 style="color: #ef4444;">Falta Configuración de Mercado Libre</h2>
          <p>La clave CLIENT_ID o CLIENT_SECRET de Mercado Libre no está configurada en la sección 'Settings' de Google AI Studio o en .env.</p>
          <button onclick="window.close()" style="margin-top:20px; padding:10px 20px; background-color:#3483FA; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Cerrar ventana</button>
        </body>
      </html>
    `);
    return;
  }

  try {
    const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
    
    // Exchange Auth Code for Token
    const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code: code as string,
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Error en Mercado Libre: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();

    // Send successful back response using postMessage
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #e0f2fe; color: #0369a1;">
          <h2 style="color: #0284c7;">¡Conectado con Éxito!</h2>
          <p>Tu cuenta de Mercado Libre ha sido vinculada de forma segura.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'MELI_AUTH_SUCCESS',
                payload: ${JSON.stringify(tokenData)}
              }, '*');
              setTimeout(() => { window.close(); }, 1500);
            } else {
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);

  } catch (err: any) {
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #fef2f2; color: #991b1b;">
          <h2 style="color: #dc2626;">Error al Enlazar</h2>
          <p>${err.message || "Error de red al canjear el token"}</p>
          <button onclick="window.close()" style="margin-top:20px; padding:10px 20px; background-color:#dc2626; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Cerrar e Intentar Nuevamente</button>
        </body>
      </html>
    `);
  }
});

app.post("/api/meli/sync-products", async (req: Request, res: Response) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    res.status(400).json({ error: "Access token es requerido para sincronizar." });
    return;
  }

  try {
    const meResponse = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!meResponse.ok) {
      throw new Error("No se pudo obtener el perfil de Mercado Libre.");
    }

    const meData = await meResponse.json();
    const userId = meData.id;

    const searchResponse = await fetch(`https://api.mercadolibre.com/users/${userId}/items/search?limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!searchResponse.ok) {
      throw new Error("No se pudo obtener los listados del vendedor.");
    }

    const searchData = await searchResponse.json();
    const itemIds: string[] = searchData.results || [];

    if (itemIds.length === 0) {
      res.json({
        sellerName: meData.nickname,
        products: []
      });
      return;
    }

    const itemsResponse = await fetch(`https://api.mercadolibre.com/items?ids=${itemIds.slice(0, 10).join(",")}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!itemsResponse.ok) {
      throw new Error("Error obteniendo detalles del producto.");
    }

    const itemsData = await itemsResponse.json();

    const productsPromises = itemsData.map(async (row: any) => {
      const item = row.body;
      if (!item) return null;

      let mliDescription = "Descripción sin detallar desde Mercado Libre.";
      try {
        const descResponse = await fetch(`https://api.mercadolibre.com/items/${item.id}/description`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (descResponse.ok) {
          const descData = await descResponse.json();
          mliDescription = descData.plain_text || mliDescription;
        }
      } catch (desError) {
        console.warn(`Error al traer descripción de ${item.id}:`, desError);
      }

      const characteristics = (item.attributes || []).slice(0, 5).map((attr: any) => ({
        key: attr.name || "Característica",
        value: attr.value_name || "N/A"
      }));

      // Buscar el SKU en los atributos (habitualmente con id SELLER_CUSTOM_FIELD) o seller_custom_field
      const skuAttr = (item.attributes || []).find((attr: any) => attr.id === "SELLER_CUSTOM_FIELD");
      const sku = skuAttr ? (skuAttr.value_name || "N/A") : (item.seller_custom_field || "N/A");

      return {
        id: item.id,
        title: item.title,
        category: item.domain_id || "Otros",
        price: item.price || 0,
        stock: item.available_quantity || 0,
        description: mliDescription,
        characteristics: characteristics.length > 0 ? characteristics : [{ key: "Condición", value: item.condition }],
        sku: sku
      };
    });

    const products = (await Promise.all(productsPromises)).filter(Boolean);

    res.json({
      sellerName: meData.nickname,
      products
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message || "Error al sincronizar datos." });
  }
});

// Setup Vite or Static serve
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[MercadoResponder Server] Running at http://localhost:${PORT}`);
  });
}

startServer();
