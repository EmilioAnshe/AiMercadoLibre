import { Product, Faq, ComplianceRule } from "./types";

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_FAQS: Faq[] = [
  {
    id: "faq-1",
    category: "Facturación",
    question: "¿Realizan Factura Tipo A o B?",
    answer: "Sí, emitimos Factura A y B de forma automática. Para recibir Factura A, asegúrate de colocar tu CUIT impositivo en los datos de facturación de tu cuenta antes de realizar la compra, ya que el sistema lo emite de manera automática con esos datos registrados.",
    isActive: true
  },
  {
    id: "faq-2",
    category: "Envíos",
    question: "¿Hacen envíos a todo el país y cuánto cuesta?",
    answer: "¡Sí, enviamos a todo el territorio nacional a través de la logística oficial de Mercado Envíos! Puedes calcular el costo de envío exacto y el tiempo estimado de entrega ingresando tu código postal de residencia en la sección debajo del precio.",
    isActive: true
  },
  {
    id: "faq-3",
    category: "Garantía",
    question: "¿Qué garantía tienen los productos?",
    answer: "Todos nuestros productos se entregan nuevos en caja cerrada y tienen 6 meses de garantía directa de nuestra parte cubriendo cualquier desperfecto de fábrica. No cubre roturas o mal uso del usuario.",
    isActive: true
  },
  {
    id: "faq-4",
    category: "Forma de Pago",
    question: "¿Qué medios de pago aceptan?",
    answer: "Aceptamos el 100% de los medios de pago ofrecidos por Mercado Pago: tarjetas de crédito en cuotas, tarjetas de débito, dinero disponible en cuenta de Mercado Pago o efectivo a través de sucursales habilitadas de Rapipago y Pago Fácil.",
    isActive: true
  },
  {
    id: "faq-5",
    category: "Retiros en Persona",
    question: "¿Ofrecen punto físico de entrega para retirar?",
    answer: "Sí, puedes retirar tu producto por nuestro depósito de retiro oficial en la zona de Palermo, Ciudad de Buenos Aires (CABA). Atendemos de lunes a viernes de 10:00 a 19:00 hs sin cita previa una vez habilitado el chat post-venta.",
    isActive: true
  }
];

export const ML_POLICIES: ComplianceRule[] = [
  {
    id: "RULE_CONTACT_PHONE",
    name: "Números de Teléfono / WhatsApp",
    category: "contact",
    description: "Prohibido compartir números de teléfono, celulares, códigos QR de contacto, o enlaces directos para chatear.",
    pattern: "Regex de validación telefónica",
    exampleViolation: "Mi número de whatsapp es 11 1234 5678, escribime y charlamos bien.",
    severity: "high"
  },
  {
    id: "RULE_IDENTITY_TAX",
    name: "Identidad y Datos Impositivos (CUIT/CUIL)",
    category: "identity",
    description: "Prohibido pedir u ofrecer CUIT, CUIL, DNI, Claves CBU, Alias o Cuentas Bancarias antes de que se formalice la compra.",
    pattern: "Regex de CUIT y palabras impositivas",
    exampleViolation: "Pásame tu CUIT por acá y te emito la cotización antes de efectuar el cobro.",
    severity: "high"
  },
  {
    id: "RULE_EXTERNAL_LINKS",
    name: "Enlaces Web Externos (URLs)",
    category: "external",
    description: "Prohibido colocar URLs, enlaces a páginas personales, tiendas digitales independientes (Mercado Shops sí está permitido si pertenece al ecosistema, pero enlaces directos externos a redes/webs no).",
    pattern: "Regex de dominio / URL",
    exampleViolation: "Mira nuestro catálogo completo en www.mitiendaonline.com",
    severity: "high"
  },
  {
    id: "RULE_SOCIAL_MEDIA",
    name: "Mención de Redes Sociales",
    category: "contact",
    description: "No se permite derivar transacciones mediante mención de perfiles de Instagram, Facebook o TikTok.",
    pattern: "@usuario o nombres de redes",
    exampleViolation: "Búscanos en Instagram como @Electrosur_AR y te damos un cupón.",
    severity: "high"
  },
  {
    id: "RULE_PAYMENT_OUTSIDE",
    name: "Cobros Fuera de la Plataforma",
    category: "payment",
    description: "Prohibida la oferta de descuentos por pago por fuera en efectivo o transferencia bancaria directa previa a la compra.",
    pattern: "Palabras clave de pago fuera",
    exampleViolation: "Si transferís directo al CBU te lo dejo un 15% más barato, confirmame.",
    severity: "high"
  },
  {
    id: "RULE_EXACT_LOCATION",
    name: "Direcciones y Ubicación Exacta",
    category: "general",
    description: "Prohibido detallar la dirección física exacta (calle y número) del local para coordinar visitas espontáneas antes de ofertar.",
    pattern: "Calle, número u orientación de cruce de calles exactas",
    exampleViolation: "Estamos en la calle Florida 456, local 12, podés venir ahora.",
    severity: "high"
  }
];
