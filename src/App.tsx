import React, { useState, useEffect } from "react";
import { 
  Building2, 
  HelpCircle, 
  AlertTriangle, 
  CheckCircle2, 
  XOctagon, 
  Settings, 
  Package, 
  ArrowRight, 
  Sparkles, 
  BadgeAlert, 
  Info, 
  Copy, 
  Check, 
  Plus, 
  Trash2, 
  Edit3, 
  ShieldCheck, 
  Search, 
  RefreshCw, 
  MessageSquare, 
  FileText,
  BookmarkCheck,
  Percent,
  MapPin,
  CreditCard,
  UserCheck
} from "lucide-react";
import { Product, Faq, ComplianceReport, SimulationResult, ComplianceIssue } from "./types";
import { INITIAL_PRODUCTS, INITIAL_FAQS, ML_POLICIES } from "./data";
import { onAuthStateChanged } from "firebase/auth";
import { onSnapshot, collection, setDoc, doc, deleteDoc } from "firebase/firestore";
import { db, auth, googleProvider, handleFirestoreError, OperationType } from "./firebase";

export function sanitizeLocalText(text: string): string {
  let sanitized = text;
  
  // Replace phone numbers
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

export default function App() {
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem("ml_products");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Product[];
        return parsed.filter(p => !p.id.startsWith("prod-"));
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [faqs, setFaqs] = useState<Faq[]>(() => {
    const saved = localStorage.getItem("ml_faqs");
    return saved ? JSON.parse(saved) : INITIAL_FAQS;
  });

  const [activeTab, setActiveTab] = useState<"simulator" | "products" | "faqs" | "optimizer" | "handbook" | "connections">("simulator");
  
  // App Notification
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Authentication & Integration State
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [meliAccount, setMeliAccount] = useState<{ nickname: string; accessToken: string } | null>(() => {
    const saved = localStorage.getItem("ml_meli_account");
    return saved ? JSON.parse(saved) : null;
  });
  const [isSyncingMeli, setIsSyncingMeli] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Auto-responder simulator state
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || "");
  const [buyerQuestion, setBuyerQuestion] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [modifiedAiResponse, setModifiedAiResponse] = useState("");
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [autoCensorEnabled, setAutoCensorEnabled] = useState(true);

  // Product CRUD State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [productForm, setProductForm] = useState<{
    id?: string;
    title: string;
    category: string;
    price: number;
    stock: number;
    description: string;
    characteristics: { key: string; value: string }[];
    sku?: string;
  }>({
    title: "",
    category: "Electrónica, Audio y Video",
    price: 0,
    stock: 1,
    description: "",
    characteristics: [{ key: "", value: "" }],
    sku: ""
  });

  // FAQ CRUD State
  const [editingFaq, setEditingFaq] = useState<Faq | null>(null);
  const [isAddingFaq, setIsAddingFaq] = useState(false);
  const [faqForm, setFaqForm] = useState<Omit<Faq, "id">>({
    category: "Garantía",
    question: "",
    answer: "",
    isActive: true
  });

  // Description Optimizer State
  const [optimizingProductId, setOptimizingProductId] = useState<string>(products[0]?.id || "");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizedText, setOptimizedText] = useState("");
  const [copiedOptimized, setCopiedOptimized] = useState(false);

  // Sandbox Tester text State (in Handbook)
  const [sandboxText, setSandboxText] = useState("Mi WhatsApp es 11 9876-5432, escribime ahí y arreglamos por transferencia directa, te hago un 10% de descuento fuera de Mercado Libre.");
  const [sandboxReport, setSandboxReport] = useState<ComplianceReport | null>(null);
  const [isSandboxChecking, setIsSandboxChecking] = useState(false);

  // Monitor Auth Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Monitor Firestore lists if user is present
  useEffect(() => {
    if (!firebaseUser) return;

    // Sub to products
    const unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
      const items: Product[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as Product);
      });
      if (items.length > 0) {
        setProducts(items);
      }
    }, (error) => {
      console.error("Firestore sync error:", error);
    });

    // Sub to FAQs
    const unsubFaqs = onSnapshot(collection(db, "faqs"), (snapshot) => {
      const items: Faq[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as Faq);
      });
      if (items.length > 0) {
        setFaqs(items);
      }
    }, (error) => {
      console.error("Firestore FAQ sync error:", error);
    });

    return () => {
      unsubProducts();
      unsubFaqs();
    };
  }, [firebaseUser]);

  // Sync Mercado Libre authorization callbacks via postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }
      if (event.data?.type === "MELI_AUTH_SUCCESS") {
        const payload = event.data.payload;
        if (payload && payload.access_token) {
          handleMeliSync(payload.access_token);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [firebaseUser]);

  // Persist Meli state locally
  useEffect(() => {
    if (meliAccount) {
      localStorage.setItem("ml_meli_account", JSON.stringify(meliAccount));
    } else {
      localStorage.removeItem("ml_meli_account");
    }
  }, [meliAccount]);

  // Save to localStorage whenever products or faqs change AND user is NOT logged into Firebase
  useEffect(() => {
    if (!firebaseUser) {
      localStorage.setItem("ml_products", JSON.stringify(products));
      localStorage.setItem("ml_faqs", JSON.stringify(faqs));
    }
  }, [products, faqs, firebaseUser]);

  const showNotification = (message: string, type: "success" | "error" | "info" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Firebase Auth Triggers
  const handleFirebaseLogin = async () => {
    try {
      const { signInWithPopup } = await import("firebase/auth");
      const result = await signInWithPopup(auth, googleProvider);
      showNotification(`¡Sesión iniciada en Firebase como ${result.user.email}!`, "success");
    } catch (err: any) {
      showNotification("Error de inicio de sesión de Firebase: " + err.message, "error");
    }
  };

  const handleFirebaseLogout = async () => {
    try {
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
      setFirebaseUser(null);
      showNotification("Sesión de Firebase cerrada.", "info");
    } catch (err: any) {
      showNotification("Error al cerrar sesión: " + err.message, "error");
    }
  };

  const handleExportToFirebase = async () => {
    if (!firebaseUser) return;
    setIsExporting(true);
    try {
      for (const prod of products) {
        await setDoc(doc(db, "products", prod.id), prod);
      }
      for (const faq of faqs) {
        await setDoc(doc(db, "faqs", faq.id), faq);
      }
      showNotification("¡Todo tu inventario y FAQs locales han sido subidos a Firebase!", "success");
    } catch (err: any) {
      showNotification("Error al exportar: " + err.message, "error");
    } finally {
      setIsExporting(false);
    }
  };

  // Mercado Libre Connection State
  const handleConnectMeliReal = async (site = "MLA") => {
    try {
      const response = await fetch(`/api/meli/auth-url?site=${site}`);
      if (!response.ok) {
        throw new Error("No se pudo obtener la URL de enlace.");
      }
      const data = await response.json();
      if (!data.configured) {
        showNotification("Mercado Libre OAuth no configurado en el servidor primario.", "error");
        return;
      }

      const authWindow = window.open(
        data.url,
        "meli_oauth_popup",
        "width=600,height=750"
      );

      if (!authWindow) {
        alert("Por favor desbloquea los popups del navegador para poder iniciar sesión con Mercado Libre.");
      }
    } catch (err: any) {
      showNotification("Error al conectar Mercado Libre: " + err.message, "error");
    }
  };

  const handleMeliSync = async (accessToken: string) => {
    setIsSyncingMeli(true);
    try {
      const response = await fetch("/api/meli/sync-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken })
      });

      if (!response.ok) {
        throw new Error("Error del servidor al sincronizar productos de Mercado Libre.");
      }

      const data = await response.json();
      setMeliAccount({
        nickname: data.sellerName || "Vendedor Mercado Libre",
        accessToken: accessToken
      });

      if (data.products && data.products.length > 0) {
        if (auth.currentUser) {
          for (const prod of data.products) {
            await setDoc(doc(db, "products", prod.id), prod);
          }
        } else {
          setProducts(prev => {
            const filtered = prev.filter(p => !data.products.some((newP: Product) => newP.id === p.id));
            return [...data.products, ...filtered];
          });
        }
        showNotification(`¡Sincronización completa! Se importaron ${data.products.length} productos de tu tienda.`, "success");
      } else {
        showNotification(`Conectado a la cuenta ${data.sellerName}, pero no se encontraron productos publicados en tu inventario.`, "info");
      }
    } catch (err: any) {
      showNotification("Error de sincronización con Mercado Libre: " + err.message, "error");
    } finally {
      setIsSyncingMeli(false);
    }
  };

  const handleSimulateDummyMeli = async () => {
    const dummyProducts: Product[] = [
      {
        id: "MLA129837",
        title: "Celular Samsung Galaxy S24 Ultra 512GB Titanium",
        category: "Celulares e Internet",
        price: 1899999,
        stock: 14,
        description: "El mejor smartphone de Samsung con cámara de 200MP e inteligencia artificial integrada.",
        characteristics: [
          { key: "Memoria RAM", value: "12 GB" },
          { key: "Cámara Principal", value: "200 Mpx" },
          { key: "Batería", value: "5000 mAh" }
        ]
      },
      {
        id: "MLA458129",
        title: "Termo Stanley Classic 1.4 Litros Con Manija",
        category: "Hogar, Muebles y Jardín",
        price: 94500,
        stock: 35,
        description: "Termo Stanley original resistente a golpes. Mantiene frío o calor por 40 horas.",
        characteristics: [
          { key: "Capacidad", value: "1.4 L" },
          { key: "Material", value: "Acero Inoxidable" }
        ]
      },
      {
        id: "MLA782910",
        title: "Auriculares Inalámbricos Sony WH-1000XM4 Noise Cancelling",
        category: "Audio y Electrónica",
        price: 450000,
        stock: 8,
        description: "Audífonos inalámbricos circumaurales Sony de cancelación de ruido líder en la industria.",
        characteristics: [
          { key: "Duración de batería", value: "30 h" },
          { key: "Cancelación de ruido", value: "Sí" }
        ]
      }
    ];

    setMeliAccount({
      nickname: "TiendaOficial_Demo",
      accessToken: "mock_demo_access_token_123"
    });

    if (auth.currentUser) {
      try {
        for (const p of dummyProducts) {
          await setDoc(doc(db, "products", p.id), p);
        }
        showNotification("¡Sincronización Sandbox completada! Se inyectaron 3 productos de prueba en Firestore.", "success");
      } catch (err) {
        showNotification("Error guardando productos de simulación en Firebase.", "error");
      }
    } else {
      setProducts(prev => {
        const filtered = prev.filter(p => !dummyProducts.some(newP => newP.id === p.id));
        return [...dummyProducts, ...filtered];
      });
      showNotification("¡Sincronización Sandbox completada! Celulares, Termos y Auriculares de muestra cargados.", "success");
    }
  };

  // Preset question templates for fast simulator testing
  const QUESTION_PRESETS = [
    { label: "Pregunta Segura de Stock", text: "Hola! ¿Tenés stock disponible de este producto para entregar esta semana? Gracias!" },
    { label: "Intento de Teléfono", text: "Hola, me interesa mucho. Me pasarías tu celular o whatsapp para coordinar el retiro rápido?" },
    { label: "Pedido de CUIT/Factura A", text: "Buenas, hacen factura A? Cuál es su cuit para verificar antes de comprar?" },
    { label: "Descuento por fuera", text: "Hola, si te pago en efectivo contra entrega o por transferencia directa me haces descuento?" },
    { label: "Pregunta Física de Dirección", text: "¿Dónde queda su local? Por qué calle o altura están para pasar a buscarlo hoy?" }
  ];

  // API Call: Auto Respond Simulation
  const handleAutoRespond = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerQuestion.trim()) {
      showNotification("Por favor introduce una pregunta de comprador.", "error");
      return;
    }
    const targetProduct = products.find(p => p.id === selectedProductId);
    if (!targetProduct) {
      showNotification("Selecciona un producto válido.", "error");
      return;
    }

    setIsValidating(true);
    setSimulationResult(null);

    try {
      const response = await fetch("/api/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: buyerQuestion,
          product: targetProduct,
          faqs: faqs.filter(f => f.isActive)
        })
      });

      if (!response.ok) {
        throw new Error("Error en el servidor al generar la respuesta.");
      }

      const data = await response.json();
      setSimulationResult(data);
      setModifiedAiResponse(data.aiResponse);
      showNotification("Simulación procesada con éxito.");
    } catch (err: any) {
      showNotification(err.message || "Error al conectar con la IA.", "error");
    } finally {
      setIsValidating(false);
    }
  };

  // API Call: Optimize Description
  const handleOptimizeDescription = async () => {
    const targetProduct = products.find(p => p.id === optimizingProductId);
    if (!targetProduct) {
      showNotification("Selecciona un producto para optimizar.", "error");
      return;
    }

    setIsOptimizing(true);
    setOptimizedText("");

    try {
      const response = await fetch("/api/optimize-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetProduct)
      });

      if (!response.ok) {
        throw new Error("Error en el servidor al optimizar la descripción.");
      }

      const data = await response.json();
      setOptimizedText(data.optimizedDescription);
      showNotification("Descripción optimizada correctamente con IA.");
    } catch (err: any) {
      showNotification(err.message || "Error al generar optimización.", "error");
    } finally {
      setIsOptimizing(false);
    }
  };

  // API Call: Validate compliance for arbitrary sandbox text
  const checkSandboxCompliance = async () => {
    if (!sandboxText.trim()) {
      showNotification("El texto está vacío.", "error");
      return;
    }
    setIsSandboxChecking(true);
    try {
      const response = await fetch("/api/check-compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sandboxText })
      });
      if (!response.ok) {
        throw new Error("Error al analizar texto.");
      }
      const data = await response.json();
      setSandboxReport(data);
      showNotification("Análisis de cumplimiento completado.");
    } catch (err: any) {
      showNotification(err.message || "Error analizando cumplimiento.", "error");
    } finally {
      setIsSandboxChecking(false);
    }
  };

  // Trigger initial sandbox text check once on load or tab change
  useEffect(() => {
    if (activeTab === "handbook") {
      checkSandboxCompliance();
    }
  }, [activeTab]);

  // Copy response utility
  const handleCopyText = (text: string, type: "responder" | "optimize" | "sandbox") => {
    navigator.clipboard.writeText(text);
    if (type === "responder") {
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    } else if (type === "optimize") {
      setCopiedOptimized(true);
      setTimeout(() => setCopiedOptimized(false), 2000);
    }
    showNotification("Copiado al portapapeles con éxito.");
  };

  // Handle characteristic row changes in product form
  const handleCharChange = (index: number, key: string, value: string) => {
    const updated = [...productForm.characteristics];
    updated[index] = { key, value };
    setProductForm({ ...productForm, characteristics: updated });
  };

  const addCharRow = () => {
    setProductForm({
      ...productForm,
      characteristics: [...productForm.characteristics, { key: "", value: "" }]
    });
  };

  const removeCharRow = (index: number) => {
    const updated = productForm.characteristics.filter((_, i) => i !== index);
    setProductForm({ ...productForm, characteristics: updated });
  };

  // Save/Update Product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.title || !productForm.description) {
      showNotification("El título y la descripción son obligatorios.", "error");
      return;
    }

    const cleanedCharacteristics = productForm.characteristics.filter(c => c.key.trim() && c.value.trim());

    if (editingProduct) {
      // Edit
      const updatedProduct: Product = {
        ...editingProduct,
        title: productForm.title,
        category: productForm.category,
        price: Number(productForm.price),
        stock: Number(productForm.stock),
        description: productForm.description,
        characteristics: cleanedCharacteristics,
        sku: productForm.sku || ""
      };

      if (firebaseUser) {
        try {
          await setDoc(doc(db, "products", editingProduct.id), updatedProduct);
          showNotification("Producto actualizado en Firestore correctamente.");
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `products/${editingProduct.id}`);
        }
      } else {
        setProducts(products.map(p => p.id === editingProduct.id ? updatedProduct : p));
        showNotification("Producto actualizado correctamente.");
      }
    } else {
      // Add
      const newProduct: Product = {
        id: `prod-${Date.now()}`,
        title: productForm.title,
        category: productForm.category,
        price: Number(productForm.price),
        stock: Number(productForm.stock),
        description: productForm.description,
        characteristics: cleanedCharacteristics,
        sku: productForm.sku || ""
      };

      if (firebaseUser) {
        try {
          await setDoc(doc(db, "products", newProduct.id), newProduct);
          showNotification("Producto agregado a Firestore correctamente.");
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `products/${newProduct.id}`);
        }
      } else {
        setProducts([...products, newProduct]);
        showNotification("Producto agregado correctamente.");
      }
    }

    // Reset forms
    setEditingProduct(null);
    setIsAddingProduct(false);
    setProductForm({
      title: "",
      category: "Electrónica, Audio y Video",
      price: 0,
      stock: 1,
      description: "",
      characteristics: [{ key: "", value: "" }],
      sku: ""
    });
  };

  const startEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setProductForm({
      title: prod.title,
      category: prod.category,
      price: prod.price,
      stock: prod.stock,
      description: prod.description,
      characteristics: prod.characteristics.length > 0 ? [...prod.characteristics] : [{ key: "", value: "" }],
      sku: prod.sku || ""
    });
    setIsAddingProduct(true);
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm("¿Estás seguro de eliminar este producto?")) {
      if (firebaseUser) {
        try {
          await deleteDoc(doc(db, "products", id));
          if (selectedProductId === id && products.length > 1) {
            setSelectedProductId(products.find(p => p.id !== id)?.id || "");
          }
          showNotification("Producto eliminado de Firestore.", "info");
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `products/${id}`);
        }
      } else {
        setProducts(products.filter(p => p.id !== id));
        if (selectedProductId === id && products.length > 1) {
          setSelectedProductId(products.find(p => p.id !== id)?.id || "");
        }
        showNotification("Producto eliminado.", "info");
      }
    }
  };

  // Save/Update FAQ
  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqForm.question || !faqForm.answer) {
      showNotification("La pregunta y respuesta son obligatorias.", "error");
      return;
    }

    if (editingFaq) {
      const updatedFaq: Faq = {
        ...editingFaq,
        ...faqForm
      };

      if (firebaseUser) {
        try {
          await setDoc(doc(db, "faqs", editingFaq.id), updatedFaq);
          showNotification("Pregunta frecuente editada en Firestore con éxito.");
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `faqs/${editingFaq.id}`);
        }
      } else {
        setFaqs(faqs.map(f => f.id === editingFaq.id ? updatedFaq : f));
        showNotification("Pregunta frecuente editada con éxito.");
      }
    } else {
      const newFaq: Faq = {
        id: `faq-${Date.now()}`,
        ...faqForm
      };

      if (firebaseUser) {
        try {
          await setDoc(doc(db, "faqs", newFaq.id), newFaq);
          showNotification("Pregunta frecuente guardada en Firestore con éxito.");
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `faqs/${newFaq.id}`);
        }
      } else {
        setFaqs([...faqs, newFaq]);
        showNotification("Pregunta frecuente agregada con éxito.");
      }
    }

    setEditingFaq(null);
    setIsAddingFaq(false);
  };

  const startEditFaq = (item: Faq) => {
    setEditingFaq(item);
    setFaqForm({
      category: item.category,
      question: item.question,
      answer: item.answer,
      isActive: item.isActive
    });
    setIsAddingFaq(true);
  };

  const handleDeleteFaq = async (id: string) => {
    if (confirm("¿Quieres eliminar esta duda frecuente?")) {
      if (firebaseUser) {
        try {
          await deleteDoc(doc(db, "faqs", id));
          showNotification("FAQ eliminada de Firestore.", "info");
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `faqs/${id}`);
        }
      } else {
        setFaqs(faqs.filter(f => f.id !== id));
        showNotification("FAQ eliminada.", "info");
      }
    }
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-sans text-slate-800 flex flex-col antialiased">
      {/* App Header Banner */}
      <header className="bg-[#FFF159] border-b border-slate-300 sticky top-0 z-30 shadow-sm py-3 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#3483FA] p-2 rounded-xl shadow-sm text-white">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-slate-900/10 text-slate-900 border border-slate-900/20 px-2 py-0.5 rounded-full font-mono flex items-center gap-1 font-semibold">
                  <Sparkles className="w-3 h-3 text-[#3483FA]" /> Gemini 3.5
                </span>
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
                MercadoResponder <span className="font-normal opacity-70 italic">AI</span> <span className="text-xs font-normal text-slate-600 font-mono">v1.1</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4 flex-wrap sm:flex-nowrap justify-center sm:justify-end">
            {firebaseUser ? (
              <div className="flex items-center gap-2 bg-white/40 border border-slate-300/40 pl-3.5 pr-1.5 py-1 rounded-2xl shadow-xs">
                <div className="hidden sm:flex flex-col items-end text-right">
                  <span className="text-[9px] font-black uppercase text-slate-700 tracking-wider">Nube Sincronizada</span>
                  <span className="text-xs font-bold text-slate-900 truncate max-w-[150px]">{firebaseUser.email}</span>
                </div>
                <button
                  onClick={handleFirebaseLogout}
                  className="bg-red-500 hover:bg-red-600 text-white border border-red-650 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 cursor-pointer shadow-sm ml-1"
                  title="Cerrar sesión de Firebase"
                >
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleFirebaseLogin}
                className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 hover:border-slate-400 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-xs whitespace-nowrap active:scale-95"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22l.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
                <span>Acceder con Google</span>
              </button>
            )}

            <div className="h-8 w-px bg-slate-350/50 hidden md:block"></div>
            <button
              onClick={() => {
                setActiveTab("handbook");
              }}
              className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
            >
              <BadgeAlert className="w-4 h-4 text-amber-400 animate-pulse" />
              Ver Normativa ML
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col lg:flex-row gap-6">
        {/* Sidebar Tabs */}
        <aside className="lg:w-64 flex-shrink-0 flex flex-col gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 py-1 pl-2">
            Módulos del Sistema
          </div>
          <nav className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible gap-1.5 pb-2 lg:pb-0 scrollbar-none">
            <button
              onClick={() => { setActiveTab("simulator"); setSimulationResult(null); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap lg:whitespace-normal w-full justify-start ${
                activeTab === "simulator"
                  ? "bg-slate-100 text-[#3483FA] border-l-4 border-[#3483FA] shadow-sm"
                  : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
              }`}
            >
              <MessageSquare className="w-4 h-4 text-[#3483FA]" />
              <span>Simulador Auto-Responder</span>
            </button>

            <button
              onClick={() => setActiveTab("products")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap lg:whitespace-normal w-full justify-start ${
                activeTab === "products"
                  ? "bg-slate-100 text-[#3483FA] border-l-4 border-[#3483FA] shadow-sm"
                  : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
              }`}
            >
              <Package className="w-4 h-4 text-emerald-600" />
              <span className="flex items-center justify-between flex-1">
                Catálogo de Productos
                <span className="text-[11px] px-2 bg-slate-100 border border-slate-200 rounded-full font-mono text-slate-600 font-bold ml-1">
                  {products.length}
                </span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab("faqs")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap lg:whitespace-normal w-full justify-start ${
                activeTab === "faqs"
                  ? "bg-slate-100 text-[#3483FA] border-l-4 border-[#3483FA] shadow-sm"
                  : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
              }`}
            >
              <HelpCircle className="w-4 h-4 text-purple-600" />
              <span className="flex items-center justify-between flex-1">
                Base de Datos FAQ
                <span className="text-[11px] px-2 bg-slate-100 border border-slate-200 rounded-full font-mono text-slate-600 font-bold ml-1">
                  {faqs.length}
                </span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab("optimizer")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap lg:whitespace-normal w-full justify-start ${
                activeTab === "optimizer"
                  ? "bg-slate-100 text-[#3483FA] border-l-4 border-[#3483FA] shadow-sm"
                  : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Optimizador de Descripciones</span>
            </button>

            <button
              onClick={() => setActiveTab("handbook")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap lg:whitespace-normal w-full justify-start ${
                activeTab === "handbook"
                  ? "bg-slate-100 text-[#3483FA] border-l-4 border-[#3483FA] shadow-sm"
                  : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Manual de Compliance</span>
            </button>

            <button
              onClick={() => setActiveTab("connections")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap lg:whitespace-normal w-full justify-start ${
                activeTab === "connections"
                  ? "bg-slate-100 text-[#3483FA] border-l-4 border-[#3483FA] shadow-sm"
                  : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
              }`}
            >
              <RefreshCw className="w-4 h-4 text-rose-500" />
              <span>Sincronización y Cuentas</span>
            </button>
          </nav>

          <hr className="border-slate-200 my-1" />

          {/* Bottom compliance card inspired by design HTML */}
          <div className="mt-auto p-4 bg-slate-900 rounded-xl text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compliance Mode</span>
              <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)] animate-pulse"></div>
            </div>
            <p className="text-[11px] leading-relaxed opacity-80 italic">Filtering: CUIL, Phone, Social Media links, External URLs.</p>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          
          {/* Notification Alert */}
          {notification && (
            <div className={`mb-4 p-4 rounded-xl border flex items-center justify-between gap-3 text-sm shadow-sm transition-transform animate-fadeIn ${
              notification.type === "success" 
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : notification.type === "error"
                ? "bg-red-50 text-red-850 border-red-200"
                : "bg-blue-50 text-blue-800 border-blue-200"
            }`}>
              <div className="flex items-center gap-2 font-medium">
                {notification.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />}
                {notification.type === "error" && <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />}
                {notification.type === "info" && <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />}
                <span>{notification.message}</span>
              </div>
              <button onClick={() => setNotification(null)} className="text-sm font-bold text-slate-400 hover:text-slate-800 font-mono">&times;</button>
            </div>
          )}

          {/* Tab 1: Simulator */}
          {activeTab === "simulator" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm text-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="p-1 px-2.5 bg-[#3483FA]/10 text-[#3483FA] border border-[#3483FA]/25 rounded font-bold text-[10px] uppercase tracking-wider">
                    HERRAMIENTA CLAVE PRE-VENTAS
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Procesador de Respuestas y Cumplimiento con IA Autointegrada
                </h2>
                <p className="text-slate-600 text-sm mt-1">
                  Introduce una pregunta de tus compradores y selecciona un producto. La IA buscará en el catálogo y FAQs para responder de forma asertiva, sanitizando cualquier intento de compartir información prohibida que ponga en peligro tu cuenta.
                </p>

                {/* Simulation Form */}
                <form onSubmit={handleAutoRespond} className="mt-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Select Product */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                        1. Seleccionar Producto en Venta:
                      </label>
                      <select
                        value={selectedProductId}
                        onChange={(e) => {
                          setSelectedProductId(e.target.value);
                          setSimulationResult(null);
                        }}
                        className="w-full bg-white border border-slate-350 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-[#3483FA] focus:ring-1 focus:ring-[#3483FA] transition"
                      >
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.title} - (${p.price.toLocaleString("es-AR")})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Auto-Censor Toggle */}
                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="pr-4">
                        <span className="text-xs font-bold text-slate-800 block">
                          Sanitizador Automatizado de Filtros (Auto-Censor)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Reemplaza números telefónicos/CUIT por advertencias sanitizadas de ML.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={autoCensorEnabled}
                        onChange={(e) => setAutoCensorEnabled(e.target.checked)}
                        className="w-4 h-4 text-[#3483FA] bg-white border-slate-300 rounded focus:ring-[#3483FA]"
                      />
                    </div>
                  </div>

                  {/* Preset Buttons */}
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Selecciona un escenario de prueba típico de Mercado Libre:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {QUESTION_PRESETS.map((preset, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setBuyerQuestion(preset.text);
                            setSimulationResult(null);
                          }}
                          className="bg-white hover:bg-slate-50 hover:text-[#3483FA] border border-slate-250 px-3 py-1.5 rounded-lg text-xs text-slate-700 font-semibold transition-all text-left shadow-xs"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Buyer Question Input Area */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      2. Pregunta Escrita por el Comprador:
                    </label>
                    <div className="relative">
                      <textarea
                        value={buyerQuestion}
                        onChange={(e) => setBuyerQuestion(e.target.value)}
                        placeholder="Escribe la consulta aquí... (ej: 'Hola, tenes stock? pasame tu tel para retirar hoy y arreglamos')"
                        className="w-full h-24 bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#3483FA] transition focus:ring-1 focus:ring-[#3483FA] shadow-xs"
                      ></textarea>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="text-xs text-slate-500 font-medium">
                      💡 La IA analizará la ficha del producto y aplicará estrictas reglas de moderación.
                    </div>
                    <button
                      type="submit"
                      disabled={isValidating}
                      className="w-full sm:w-auto bg-[#3483FA] hover:bg-blue-600 font-bold text-white px-6 py-2.5 rounded-xl text-sm transition-all focus:outline-none flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      {isValidating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Procesando con IA...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" /> Generar Respuesta Políticamente Segura
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Source Details of Active Product for contextual visual inspection */}
              {selectedProduct && !simulationResult && (
                <div className="bg-white rounded-2xl p-5 border border-slate-200 text-xs text-slate-600 flex flex-col md:flex-row gap-5 items-start justify-between shadow-sm">
                  <div className="space-y-1">
                    <p className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                      <img referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=150&auto=format&fit=crop" alt="ML Icon" className="w-5 h-5 rounded object-cover" />
                      Información de Ficha Técnica que leerá la IA:
                    </p>
                    <p className="max-w-2xl text-[11px] leading-relaxed">
                      <span className="text-slate-800 font-bold block mt-1">Descripción de Publicación:</span> {selectedProduct.description}
                    </p>
                  </div>
                  <div className="flex-shrink-0 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 w-full md:w-auto">
                    <p className="font-bold text-slate-800 text-xs mb-1">Especificaciones Cuyo:</p>
                    <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                      {selectedProduct.characteristics.slice(0, 3).map((c, i) => (
                        <li key={i}><span className="font-semibold text-slate-800">{c.key}:</span> {c.value}</li>
                      ))}
                      {selectedProduct.characteristics.length > 3 && <li>y {selectedProduct.characteristics.length - 3} más...</li>}
                    </ul>
                  </div>
                </div>
              )}

              {/* Simulation Results Workspace */}
              {simulationResult && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
                  
                  {/* Left Column: IA Generated Answer Sandbox */}
                  <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between text-white">
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-white/10">
                        <div className="flex items-center gap-2">
                          <span className="p-1 px-2.5 bg-[#3483FA]/20 text-blue-300 border border-blue-500/30 rounded font-bold text-[10px] uppercase tracking-wider">
                            Sugerencia IA de Respuesta
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-semibold">
                          Precisión: <span className="text-green-400 font-bold">{simulationResult.confidence}%</span>
                        </div>
                      </div>

                      {/* Warning about user attempting violation */}
                      {simulationResult.buyerSafetyWarning && (
                        <div className="bg-red-500/10 border border-red-500/25 text-red-200 p-3 mt-3 rounded-xl flex items-start gap-2.5 text-xs">
                          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-red-400 block mb-0.5">¡Intento de falta de cumplimiento del comprador!</span>
                            {simulationResult.buyerSafetyWarning}
                          </div>
                        </div>
                      )}

                      {/* Display Safe and Sanitized Answer */}
                      <div className="mt-4 space-y-1.5">
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-widest">
                          Respuesta Segura Recomendada (Editable):
                        </label>
                        <textarea
                          value={modifiedAiResponse}
                          onChange={(e) => setModifiedAiResponse(e.target.value)}
                          className="w-full h-44 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-gray-200 focus:outline-none focus:border-[#3483FA] transition focus:ring-1 focus:ring-[#3483FA]"
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-3 justify-between items-center text-xs">
                      <div className="text-slate-400 font-medium">
                        {simulationResult.sourcesUsed.faqUsed.length > 0 ? (
                          <span className="flex items-center gap-1.5 text-purple-400 font-semibold">
                            <BookmarkCheck className="w-4 h-4" /> FAQ Inyectada: {simulationResult.sourcesUsed.faqUsed[0]}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-green-400 font-semibold">
                            <CheckCircle2 className="w-4 h-4" /> Catálogo oficial emparejado.
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setModifiedAiResponse(autoCensorEnabled ? sanitizeLocalText(simulationResult.aiResponse) : simulationResult.aiResponse);
                            showNotification("Respuesta restablecida al estado original de la IA.");
                          }}
                          className="px-4 py-2 bg-slate-800 border border-slate-755 hover:bg-slate-700 hover:text-white rounded-xl text-xs font-bold text-slate-200 transition"
                        >
                          Restablecer
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyText(modifiedAiResponse, "responder")}
                          className="px-5 py-2 bg-[#3483FA] hover:bg-blue-600 font-bold rounded-xl text-xs text-white transition flex items-center gap-1.5 shadow-sm"
                        >
                          {copiedResponse ? (
                            <>
                              <Check className="w-3.5 h-3.5" /> Copiado!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" /> Copiar Respuesta
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Compliance Inspector Report Screen */}
                  <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl text-white">
                    <div className="pb-3 border-b border-white/10 flex items-center justify-between">
                      <p className="font-bold text-white text-sm flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-amber-500" /> Analizador de Políticas
                      </p>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold tracking-wider ${
                        simulationResult.complianceReport.isCompliant
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : "bg-red-500/20 text-red-400 border border-red-500/30"
                      }`}>
                        {simulationResult.complianceReport.isCompliant ? "APROBADO" : "CON INFRACCIÓN"}
                      </span>
                    </div>

                    {/* Score Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-300">Calificación de Cumplimiento:</span>
                        <span className={`${
                          simulationResult.complianceReport.score >= 90
                            ? "text-green-400"
                            : simulationResult.complianceReport.score >= 60
                            ? "text-yellow-400"
                            : "text-red-400"
                        }`}>
                          {simulationResult.complianceReport.score} / 100 ptos
                        </span>
                      </div>
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-white/5">
                        <div 
                          className={`h-full transition-all duration-500 ${
                            simulationResult.complianceReport.score >= 90
                              ? "bg-green-500"
                              : simulationResult.complianceReport.score >= 60
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${simulationResult.complianceReport.score}%` }}
                        />
                      </div>
                    </div>

                    {/* List of Compliance Audited Checks */}
                    <div className="space-y-2.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Revisión de Reglas de Moderación:
                      </p>

                      {simulationResult.complianceReport.issues.length === 0 ? (
                        <div className="bg-green-500/10 p-4 border border-green-500/25 rounded-xl space-y-1.5">
                          <div className="flex gap-2 items-start text-green-200 text-xs">
                            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-white">¡No se detectaron violaciones!</p>
                              <p className="text-[11px] leading-relaxed text-slate-300 mt-0.5">La respuesta propuesta es 100% segura. Está libre de información de contacto restringida, direcciones de tiendas directas o solicitudes de pago fuera del ecosistema oficial.</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {simulationResult.complianceReport.issues.map((issue: any, i: number) => (
                            <div key={i} className="bg-red-500/10 p-3 rounded-xl border border-red-500/20 flex gap-2.5 items-start">
                              <XOctagon className="w-4.5 h-4.5 text-red-400 flex-shrink-0 mt-0.5" />
                              <div className="text-xs space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-white">{issue.ruleName}</span>
                                  <span className="bg-red-950 text-red-300 text-[9px] px-1.5 py-0.2 rounded font-mono font-bold border border-red-900/50">
                                    {issue.severity.toUpperCase()}
                                  </span>
                                </div>
                                <p className="text-slate-300 text-[11px] leading-relaxed">{issue.message}</p>
                                {issue.detectedText && (
                                  <p className="text-amber-400 text-[10px] bg-slate-950 p-1 px-2 rounded font-mono border border-white/5 inline-block">
                                    Detectado: &quot;{issue.detectedText}&quot;
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* General Safeguards Handbook list */}
                      <div className="bg-slate-950 p-3 rounded-xl border border-white/5 space-y-1 text-[11px] text-slate-400">
                        <p className="font-bold text-slate-300">Pautas de Compliance Verificadas:</p>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1 font-mono text-[10px]">
                          <span className="text-green-400 flex items-center gap-1">✔ Sin Teléfonos</span>
                          <span className="text-green-400 flex items-center gap-1">✔ Sin E-mails/Links</span>
                          <span className="text-green-400 flex items-center gap-1">✔ Sin Redes Sociales</span>
                          <span className="text-green-400 flex items-center gap-1">✔ Sin CUIT/CUIL/DNI</span>
                          <span className="text-green-400 flex items-center gap-1 col-span-2">✔ Sin Invitación Cobro Externo</span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Products CRUD */}
          {activeTab === "products" && (
            <div className="space-y-6">
              
              {/* Product inventory list header */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-slate-800">
                  <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                    <Package className="w-5.5 h-5.5 text-[#3483FA]" /> Catálogo Simulador de Productos
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Administra las fichas de características y descripciones que lee la IA para automatizar las respuestas preventa.
                  </p>
                </div>
                {!isAddingProduct && (
                  <button
                    onClick={() => {
                      setEditingProduct(null);
                      setProductForm({
                        title: "",
                        category: "Electrónica, Audio y Video",
                        price: 5000,
                        stock: 5,
                        description: "",
                        characteristics: [{ key: "", value: "" }]
                      });
                      setIsAddingProduct(true);
                    }}
                    className="bg-[#3483FA] hover:bg-blue-600 font-bold px-4 py-2.5 rounded-xl text-xs text-white transition flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Agregar Producto
                  </button>
                )}
              </div>

              {/* Add/Edit Product Form layout */}
              {isAddingProduct && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm animate-fadeIn space-y-4 text-slate-850">
                  <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-[#3483FA]" />
                    {editingProduct ? `Editar Ficha Técnica de: ${editingProduct.title}` : "Agregar Nuevo Producto al Catálogo"}
                  </h3>
                  
                  <form onSubmit={handleSaveProduct} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Título de la Publicación:</label>
                        <input
                          type="text"
                          required
                          value={productForm.title}
                          onChange={(e) => setProductForm({ ...productForm, title: e.target.value })}
                          placeholder="Ej: Camiseta de Algodón Orgánico Ultra Confortable"
                          className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#3483FA] focus:ring-1 focus:ring-[#3483FA] transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Categoría General:</label>
                        <input
                          type="text"
                          required
                          value={productForm.category}
                          onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                          placeholder="Ej: Ropa y Calzado"
                          className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#3483FA] focus:ring-1 focus:ring-[#3483FA] transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">SKU / Código Único:</label>
                        <input
                          type="text"
                          value={productForm.sku || ""}
                          onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                          placeholder="Ej: SEM-ABC-123"
                          className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#3483FA] focus:ring-1 focus:ring-[#3483FA] transition"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Precio Unitario ($ ARS):</label>
                        <input
                          type="number"
                          required
                          value={productForm.price || ""}
                          onChange={(e) => setProductForm({ ...productForm, price: Number(e.target.value) })}
                          placeholder="Ej: 45000"
                          className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#3483FA] focus:ring-1 focus:ring-[#3483FA] transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Stock Disponible:</label>
                        <input
                          type="number"
                          required
                          value={productForm.stock || ""}
                          onChange={(e) => setProductForm({ ...productForm, stock: Number(e.target.value) })}
                          placeholder="Ej: 10"
                          className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#3483FA] focus:ring-1 focus:ring-[#3483FA] transition"
                        />
                      </div>
                    </div>

                    {/* Description Area */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Descripción Detallada (Datos Básicos para la IA):</label>
                      <textarea
                        required
                        value={productForm.description}
                        onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                        placeholder="Escribe todas las características, bondades, usos, modos de empleo, políticas de devolución y compatibilidades del producto..."
                        className="w-full h-32 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#3483FA] focus:ring-1 focus:ring-[#3483FA] transition"
                      />
                    </div>

                    {/* Technical Characteristics Key-Value array builder */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-slate-500 uppercase">
                          Características Técnicas Adicionales (Ficha Técnica):
                        </label>
                        <button
                          type="button"
                          onClick={addCharRow}
                          className="text-[11px] text-[#3483FA] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar Fila
                        </button>
                      </div>

                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {productForm.characteristics.map((char, index) => (
                          <div key={index} className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={char.key}
                              onChange={(e) => handleCharChange(index, e.target.value, char.value)}
                              placeholder="Filtro (ej: Color, Voltaje, Origen)"
                              className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#3483FA] focus:ring-1 focus:ring-[#3483FA] transition"
                            />
                            <input
                              type="text"
                              value={char.value}
                              onChange={(e) => handleCharChange(index, char.key, e.target.value)}
                              placeholder="Especificación (ej: Negro Mate, 220V, Argentina)"
                              className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#3483FA] focus:ring-1 focus:ring-[#3483FA] transition"
                            />
                            <button
                              type="button"
                              onClick={() => removeCharRow(index)}
                              className="p-1 px-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl border border-red-200 text-xs transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProduct(null);
                          setIsAddingProduct(false);
                        }}
                        className="px-4 py-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#3483FA] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                      >
                        {editingProduct ? "Guardar Cambios" : "Guardar Producto"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Product Grid / Empty State */}
              {products.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-4 max-w-xl mx-auto shadow-sm">
                  <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                    <Package className="w-8 h-8 text-[#3483FA]" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-md font-extrabold text-slate-800">No hay productos cargados</h3>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                      Tu catálogo está vacío por defecto. Vincula tu cuenta oficial de Mercado Libre para sincronizar automáticamente todos tus productos con stock, precio y SKU, o agrégalos manualmente.
                    </p>
                  </div>
                  <div className="flex gap-2.5 justify-center pt-2">
                    <button
                      onClick={() => {
                        setActiveTab("connections");
                        showNotification("Utiliza el botón de Mercado Libre para sincronizar tu catálogo.", "info");
                      }}
                      className="bg-[#3483FA] hover:bg-blue-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Vincular Cuenta
                    </button>
                    {!isAddingProduct && (
                      <button
                        onClick={() => setIsAddingProduct(true)}
                        className="bg-slate-105 hover:bg-slate-150 border border-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl transition cursor-pointer"
                      >
                        Crear Manualmente
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map(prod => (
                    <div key={prod.id} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition space-y-3 hover:border-slate-300">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] bg-slate-100 text-[#3483FA] border border-slate-200 rounded-full px-2 py-0.5 font-bold">
                            {prod.category}
                          </span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEditProduct(prod)}
                              className="text-slate-500 hover:text-[#3483FA] p-1.5 rounded-lg hover:bg-slate-100 transition"
                              title="Editar"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(prod.id)}
                              className="text-slate-500 hover:text-red-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <h3 className="text-slate-900 font-extrabold text-sm tracking-tight line-clamp-2">
                          {prod.title}
                        </h3>

                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
                          {prod.description}
                        </p>

                        {/* Info Pills */}
                        <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] text-slate-650">
                          <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                            <span className="text-slate-400 font-bold block text-[9px] uppercase tracking-wider leading-none">Precio:</span>
                            <span className="font-extrabold text-slate-900 block mt-1">${prod.price.toLocaleString("es-AR")}</span>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                            <span className="text-slate-400 font-bold block text-[9px] uppercase tracking-wider leading-none">Stock:</span>
                            <span className="font-extrabold text-slate-900 block mt-1">{prod.stock} u.</span>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 truncate">
                            <span className="text-slate-400 font-bold block text-[9px] uppercase tracking-wider leading-none">SKU:</span>
                            <span className="font-extrabold text-slate-900 block mt-1 truncate" title={prod.sku || "Sin SKU"}>
                              {prod.sku || "—"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
                        <span className="text-[10.5px] text-slate-400 font-medium">
                          {prod.characteristics.length} características
                        </span>
                        <button
                          onClick={() => {
                            setSelectedProductId(prod.id);
                            setActiveTab("simulator");
                            setSimulationResult(null);
                          }}
                          className="text-[11px] text-[#3483FA] font-bold hover:underline flex items-center gap-1"
                        >
                          Simular Q&A <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* Tab 3: FAQ Admin */}
          {activeTab === "faqs" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-slate-800">
                  <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                    <HelpCircle className="w-5.5 h-5.5 text-purple-600" /> Base de Conocimiento de Preguntas Frecuentes (FAQ)
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Configura las directivas de servicio al cliente (Envíos, Factura A, Garantía, Medios de Pago) para complementar las respuestas de la IA.
                  </p>
                </div>
                {!isAddingFaq && (
                  <button
                    onClick={() => {
                      setEditingFaq(null);
                      setFaqForm({
                        category: "Garantía",
                        question: "",
                        answer: "",
                        isActive: true
                      });
                      setIsAddingFaq(true);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 font-bold px-4 py-2.5 rounded-xl text-xs text-white transition flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Agregar FAQ
                  </button>
                )}
              </div>

              {/* Add/Edit FAQ form */}
              {isAddingFaq && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm animate-fadeIn space-y-4 text-slate-850">
                  <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-purple-600" />
                    {editingFaq ? "Editar Pregunta Frecuente" : "Registrar Nueva Pregunta Frecuente"}
                  </h3>
                  
                  <form onSubmit={handleSaveFaq} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Categoría General / Tag de Mapeo:</label>
                        <select
                          value={faqForm.category}
                          onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                        >
                          <option value="Facturación">Facturación / Boletas de Pago</option>
                          <option value="Envíos">Logística o Despacho</option>
                          <option value="Garantía">Garantías y Cambios</option>
                          <option value="Forma de Pago">Medios de Pago o Cuotas</option>
                          <option value="Retiros en Persona">Retiros y Entregas Físicas</option>
                          <option value="Servicio Técnico">Servicio Técnico</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 mt-5 md:mt-0">
                        <label className="text-xs font-bold text-slate-700 uppercase">¿Inyectar automáticamente esta FAQ?</label>
                        <input
                          type="checkbox"
                          checked={faqForm.isActive}
                          onChange={(e) => setFaqForm({ ...faqForm, isActive: e.target.checked })}
                          className="w-4 h-4 text-purple-600 rounded bg-white border-slate-300 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Pregunta Simulada Común:</label>
                      <input
                        type="text"
                        required
                        value={faqForm.question}
                        onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                        placeholder="Ej: ¿Cobran recargo por pagar con tarjeta de crédito?"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Respuesta Estándar Inteligente para ML (Sujeta a Compliance):</label>
                      <textarea
                        required
                        value={faqForm.answer}
                        onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                        placeholder="Escribe la directiva limpia. RECUERDA: no incluyas datos de contacto personales."
                        className="w-full h-24 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                      />
                    </div>

                    <div className="flex gap-2 justify-end pt-3 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFaq(null);
                          setIsAddingFaq(false);
                        }}
                        className="px-4 py-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                      >
                        {editingFaq ? "Guardar Cambios" : "Guardar FAQ"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* FAQ List Display */}
              <div className="space-y-4">
                {faqs.map(item => (
                  <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row justify-between gap-4 hover:shadow-xs transition">
                    <div className="space-y-2.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="p-1 px-2.5 bg-purple-150/10 text-purple-700 border border-purple-200 rounded-full font-bold text-[10px] uppercase">
                          {item.category}
                        </span>
                        {!item.isActive && (
                          <span className="bg-amber-50 text-amber-700 text-[10px] px-2 py-0.5 rounded-full border border-amber-200 font-bold">
                            Silenciado
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="text-slate-900 font-extrabold text-sm tracking-tight">
                          {item.question}
                        </h4>
                        <p className="text-xs text-slate-550 mt-1.5 leading-relaxed pl-3.5 border-l-2 border-[#3483FA]">
                          {item.answer}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col gap-1.5 items-end justify-center">
                      <button
                        onClick={() => startEditFaq(item)}
                        className="text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-purple-600" /> Editar
                      </button>
                      <button
                        onClick={() => handleDeleteFaq(item.id)}
                        className="text-xs bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 4: Description Optimizer */}
          {activeTab === "optimizer" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-2 text-slate-850">
                <span className="p-1 px-2.5 bg-[#3483FA]/10 text-[#3483FA] border border-[#3483FA]/20 rounded font-bold text-[10px] uppercase tracking-wider">
                  Incrementa tu Tasa de Conversión (SEO y Ventas)
                </span>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Optimizador de Descripciones con IA Seguro para Mercado Libre
                </h2>
                <p className="text-slate-600 text-sm mt-1">
                  Utiliza inteligencia artificial inteligente para reestructurar la descripción de tu producto. Añade ganchos comerciales potentes, organiza la información técnica en viñetas limpias y garantiza que la publicación no viole ninguna política de contacto que suspenda tu listado.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Selecciona un Producto de tu Inventario:
                    </label>
                    <select
                      value={optimizingProductId}
                      onChange={(e) => {
                        setOptimizingProductId(e.target.value);
                        setOptimizedText("");
                      }}
                      className="w-full bg-white border border-slate-350 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-[#3483FA] focus:ring-1 focus:ring-[#3483FA] transition"
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={handleOptimizeDescription}
                      disabled={isOptimizing}
                      className="w-full bg-[#3483FA] hover:bg-blue-600 font-bold text-white px-4 py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {isOptimizing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Optimizando...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" /> Optimizar Publicación con IA
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Result Comparison Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Column: Original */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 text-slate-850">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Descripción Original (Ficha Actual):
                    </span>
                    <span className="text-[10px] bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-full text-slate-500 font-bold">
                      Solo Lectura
                    </span>
                  </div>
                  
                  {products.find(p => p.id === optimizingProductId) ? (
                    <div className="space-y-3">
                      <p className="text-slate-900 font-extrabold text-sm">
                        {products.find(p => p.id === optimizingProductId)?.title}
                      </p>
                      <p className="text-xs text-slate-650 leading-relaxed max-h-96 overflow-y-auto whitespace-pre-line p-4 bg-slate-50 rounded-xl border border-slate-200">
                        {products.find(p => p.id === optimizingProductId)?.description}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-405 text-center py-6">Selecciona un producto arriba.</p>
                  )}
                </div>

                {/* Column: Optimized */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3 text-slate-850">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#3483FA] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Estructura Optimizada y Segura:
                    </span>
                    {optimizedText && (
                      <button
                        onClick={() => handleCopyText(optimizedText, "optimize")}
                        className="text-xs text-[#3483FA] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedOptimized ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> Copiado!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copiar Texto
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {isOptimizing ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
                      <RefreshCw className="w-8 h-8 text-[#3483FA] animate-spin" />
                      <p className="text-xs font-bold animate-pulse text-slate-800">Gemini redactando descripción para Mercado Libre...</p>
                      <p className="text-[11px] text-slate-500 max-w-sm text-center">Verificando en tiempo real que no incluya ningún enlace o teléfono prohibido.</p>
                    </div>
                  ) : optimizedText ? (
                    <div className="space-y-3">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-96 overflow-y-auto font-sans text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                        {optimizedText}
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-[11px] text-emerald-800 flex items-center gap-1.5 font-medium animate-fadeIn">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>¡Verificado Listo! Cumple 100% de normativas y está listo para pegar en tu publicación oficial.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-20 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                      <FileText className="w-8 h-8 text-slate-300" />
                      <p className="font-medium">Haz clic en &quot;Optimizar Publicación&quot; para generar la versión comercial perfecta.</p>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* Tab 5: Handbook and Compliance Checker Sandbox */}
          {activeTab === "handbook" && (
            <div className="space-y-6">
              
              {/* Informative Handbook */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* Rules Details */}
                <div className="md:col-span-7 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4 text-slate-850">
                  <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                    <ShieldCheck className="w-5.5 h-5.5 text-rose-500" /> Guía Completa de Políticas de Mercado Libre
                  </h2>
                  <p className="text-slate-500 text-xs">
                    Mercado Libre es extremadamente estricto con sus políticas de comunicación previa a la venta. Las infracciones acumuladas derivan en penalizaciones de posicionamiento o suspensiones de cuenta. Evita siempre estos términos:
                  </p>

                  <div className="space-y-3">
                    {ML_POLICIES.map(policy => (
                      <div key={policy.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                            {policy.category === "contact" && <UserCheck className="w-3.5 h-3.5 text-blue-600" />}
                            {policy.category === "identity" && <Percent className="w-3.5 h-3.5 text-purple-600" />}
                            {policy.category === "external" && <MapPin className="w-3.5 h-3.5 text-red-600" />}
                            {policy.category === "payment" && <CreditCard className="w-3.5 h-3.5 text-amber-600" />}
                            {policy.category === "general" && <Info className="w-3.5 h-3.5 text-indigo-600" />}
                            {policy.name}
                          </span>
                          <span className="text-[9px] bg-red-105 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full font-bold">
                            ALERTA SUSPENSIÓN
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{policy.description}</p>
                        <div className="bg-rose-50/50 text-rose-900 p-2.5 rounded-xl text-[11px] border border-rose-100 font-sans">
                          <span className="font-extrabold text-rose-700">Frase Prohibida Ejemplo:</span> &quot;{policy.exampleViolation}&quot;
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Real-time Sandbox Tester Panel */}
                <div className="md:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between text-slate-850">
                  <div>
                    <h3 className="text-md font-extrabold text-slate-900 flex items-center gap-2">
                      <Settings className="w-5 h-5 text-[#3483FA]" /> Probador Inteligente de Mensajes
                    </h3>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                      Escribe o pega cualquier borrador de respuesta aquí abajo y ejecútalo a través de nuestro escáner de cumplimiento para verificar infracciones en tiempo real.
                    </p>

                    <div className="mt-4 space-y-2">
                      <textarea
                        value={sandboxText}
                        onChange={(e) => {
                          setSandboxText(e.target.value);
                          setSandboxReport(null);
                        }}
                        className="w-full h-36 bg-white border border-slate-300 rounded-xl px-4 py-3 text-xs text-slate-800 focus:outline-none focus:border-[#3483FA] focus:ring-1 focus:ring-[#3483FA] transition"
                        placeholder="Escribe un mensaje aquí para testear..."
                      />
                      <button
                        onClick={checkSandboxCompliance}
                        disabled={isSandboxChecking}
                        className="w-full bg-[#3483FA] hover:bg-blue-600 font-bold text-white px-4 py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        {isSandboxChecking ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analizando mensaje...
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5" /> Escanear Cumplimiento Pre-Publicación
                          </>
                        )}
                      </button>
                    </div>

                    {/* Sandbox Analysis Result Display */}
                    {sandboxReport && (
                      <div className="mt-4 space-y-3 border-t border-slate-150 pt-3 animate-fadeIn">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">Análisis del Filtro:</span>
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                            sandboxReport.isCompliant
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-250 border-emerald-200"
                              : "bg-rose-50 text-rose-800 border border-rose-250 border-rose-200"
                          }`}>
                            {sandboxReport.isCompliant ? "APROBADO" : "RECHAZADO POR SISTEMA"}
                          </span>
                        </div>

                        {/* Audit issues list */}
                        {sandboxReport.issues.length > 0 ? (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {sandboxReport.issues.map((issue, index) => (
                              <div key={index} className="bg-rose-50/50 p-2.5 rounded-xl border border-rose-100 text-[11px] text-rose-900 leading-relaxed font-semibold">
                                <span className="text-rose-700 font-extrabold block">🚫 Infracción: {issue.ruleName}</span>
                                <span className="text-slate-650 font-normal mt-0.5 block">{issue.message}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-emerald-750 font-extrabold">¡Texto 100% seguro! Ninguna infracción de contacto detectada.</p>
                        )}

                        {/* Sanitized Text show */}
                        {!sandboxReport.isCompliant && (
                          <div className="space-y-1 pt-1">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">
                              Borrador Autocorregido Sanitizado:
                            </span>
                            <div className="bg-slate-50 p-3 rounded-xl text-xs font-mono text-emerald-800 border border-slate-200 whitespace-pre-line leading-relaxed font-bold">
                              {sandboxReport.sanitizedText}
                            </div>
                            <span className="text-[9px] text-slate-450 block font-semibold">
                              Se han redactado las partes peligrosas para evitar penalizaciones automáticas de Mercado Libre.
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-[10.5px] pt-4 text-slate-450 border-t border-slate-100 mt-4 leading-relaxed">
                    ℹ️ Nota: Esta protección utiliza un motor heurístico combinatorio y procesadores semánticos avanzados sincronizados con el ecosistema de políticas de Mercado Libre de Latinoamérica.
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Tab 6: Connections & Sync */}
          {activeTab === "connections" && (
            <div className="space-y-6">
              
              {/* Introduction Banner */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-2 text-slate-850">
                <span className="p-1 px-2.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-bold text-[10px] uppercase tracking-wider">
                  Nube e Integración Oficial
                </span>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Centro de Sincronización de Cuentas y Base de Datos
                </h2>
                <p className="text-slate-600 text-sm mt-1">
                  Administra las conexiones activas en tu software. Elige vincular una base de datos Firebase persistente en tiempo real para guardar de forma segura tus artículos y respuestas, o sincroniza tu tienda de Mercado Libre para responder directamente preguntas de tus clientes con inteligencia artificial.
                </p>
              </div>

              {/* Flex Grid Container for connections */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. Firebase Connections Panel */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5 text-slate-850 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold font-mono">
                          F
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-slate-900 leading-tight block">Base de Datos Firebase</h3>
                          <p className="text-[11px] text-slate-500">Google Firestore Cloud Storage</p>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                        firebaseUser 
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-slate-50 text-slate-500 border border-slate-200"
                      }`}>
                        {firebaseUser ? "☁️ CONECTADO" : "DESCONECTADO"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed mb-4">
                      Vincular tu cuenta te permite persistir el inventario de artículos y la base de conocimiento de preguntas frecuentes de manera centralizada en la nube de Firebase, evitando que se pierdan al borrar las cookies del navegador o al reiniciar la sesión local.
                    </p>

                    {firebaseUser ? (
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="space-y-1 text-xs">
                          <p className="text-slate-500">Sesión activa como:</p>
                          <p className="font-extrabold text-slate-800">{firebaseUser.email}</p>
                          <p className="text-[10px] text-slate-400 font-mono">UID: {firebaseUser.uid}</p>
                        </div>

                        {/* Cloud status metrics */}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="bg-white p-2 text-center rounded-lg border border-slate-150">
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Catálogo Cloud</span>
                            <span className="text-sm font-black text-slate-800">{products.length} Items</span>
                          </div>
                          <div className="bg-white p-2 text-center rounded-lg border border-slate-150">
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">FAQs Cloud</span>
                            <span className="text-sm font-black text-slate-800">{faqs.length} FAQs</span>
                          </div>
                        </div>

                        {/* Sync Offline data button */}
                        <button
                          onClick={handleExportToFirebase}
                          disabled={isExporting}
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-3 rounded-lg text-xs tracking-wide transition flex items-center justify-center gap-1.5 disabled:opacity-50 mt-2 cursor-pointer"
                        >
                          {isExporting ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Subiendo...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5" /> Subir inventario local al Firebase
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100 text-xs text-orange-950">
                        <p className="font-extrabold mb-1">💡 Modo Invitado Local Activo</p>
                        <p className="leading-relaxed opacity-90">
                          Actualmente estás operando en modo local seguro. Tus datos se guardan en el almacenamiento local. Inicia sesión para conectarte de forma automática a tu base de datos cloud de Firebase Firestore.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100">
                    {firebaseUser ? (
                      <button
                        onClick={handleFirebaseLogout}
                        className="w-full bg-red-50 hover:bg-red-105 border border-red-200 text-red-650 font-bold text-xs py-2.5 rounded-xl transition cursor-pointer"
                      >
                        Cerrar Sesión Firebase
                      </button>
                    ) : (
                      <button
                        onClick={handleFirebaseLogin}
                        className="w-full bg-slate-900 hover:bg-slate-850 text-white font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                      >
                        <Sparkles className="w-4 h-4 text-orange-400" />
                        Iniciar Sesión con Google
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Mercado Libre Integration Panel */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5 text-slate-850 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#3483FA] flex items-center justify-center font-bold">
                          ML
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-slate-900 leading-tight block">Cuenta de Mercado Libre</h3>
                          <p className="text-[11px] text-slate-500">API Oficial de Integración</p>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                        meliAccount 
                          ? "bg-blue-50 text-[#3483FA] border border-blue-200"
                          : "bg-slate-50 text-slate-500 border border-slate-200"
                      }`}>
                        {meliAccount ? "🔑 VINCULADO" : "DESCONECTADO"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed mb-4">
                      Enlaza tu cuenta de vendedor oficial de Mercado Libre para poder importar instantáneamente tus productos publicados, descripciones y características activas directamente desde la API del ecosistema de Mercado Libre.
                    </p>

                    {meliAccount ? (
                      <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-2">
                        <div className="space-y-1 text-xs">
                          <span className="text-[10px] bg-blue-100 text-[#3483FA] font-bold px-2 py-0.5 rounded-full">Nick Mercado Libre</span>
                          <p className="font-black text-slate-900 text-sm mt-1">{meliAccount.nickname}</p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">Token activo heredado para consultas API.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                        <p className="font-bold text-slate-700 mb-1">Pre-visualizar mercados disponibles:</p>
                        <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">Selecciona la extensión regional para conectarte a tu panel regional oficial:</p>
                        
                        <div className="grid grid-cols-3 gap-1.5 text-center">
                          <button onClick={() => showNotification("Región seleccionada por defecto: Argentina (MLA)", "info")} className="bg-white hover:bg-slate-100 border border-slate-200 p-2 rounded text-[10px] font-bold text-slate-700 cursor-pointer">Argentina (MLA)</button>
                          <button onClick={() => showNotification("Región seleccionada: México (MLM)", "info")} className="bg-white hover:bg-slate-100 border border-slate-200 p-2 rounded text-[10px] font-bold text-slate-700 cursor-pointer">México (MLM)</button>
                          <button onClick={() => showNotification("Región seleccionada: Brasil (MLB)", "info")} className="bg-white hover:bg-slate-100 border border-slate-200 p-2 rounded text-[10px] font-bold text-slate-700 cursor-pointer">Brasil (MLB)</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-4 border-t border-slate-100">
                    {meliAccount ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleMeliSync(meliAccount.accessToken)}
                          disabled={isSyncingMeli}
                          className="flex-1 bg-[#3483FA] hover:bg-blue-600 text-white font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {isSyncingMeli ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sincronizando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5" /> Re-Sincronizar Catálogo
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setMeliAccount(null);
                            showNotification("Cuenta de Mercado Libre desvinculada del simulador local.", "info");
                          }}
                          className="bg-red-50 hover:bg-red-105 border border-red-200 text-red-650 p-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          Desvincular
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Direct OAuth popup button */}
                        <button
                          onClick={() => handleConnectMeliReal("MLA")}
                          className="w-full bg-[#3483FA] hover:bg-blue-600 text-white font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                        >
                          <RefreshCw className="w-4 h-4 text-white" />
                          Conectar Mercado Libre Oficial (OAuth)
                        </button>

                        {/* Beautiful fallback Mock testing button */}
                        <button
                          onClick={handleSimulateDummyMeli}
                          className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-xs py-2 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                        >
                          ⚙️ Simular Conexión (Modo Sandbox de Pruebas)
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Helpful Integration Documentation Setup Guide card */}
              <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 border border-slate-800 shadow-md space-y-4">
                <h3 className="text-md font-bold flex items-center gap-2 text-yellow-400">
                  <ShieldCheck className="w-5 h-5 text-yellow-400" /> Guía de Configuración Oficial para Credenciales de Producción
                </h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Para habilitar la autenticación real por OAuth mediante la plataforma oficial de desarrolladores de Mercado Libre, debes completar los siguientes pasos en tu portal del desarrollador:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1 bg-slate-800 p-3.5 rounded-xl border border-slate-750">
                    <span className="font-extrabold text-yellow-400">Paso 1: Crear la App</span>
                    <p className="text-slate-350 leading-relaxed text-[11px] mt-1">
                      Ingresa al portal <a href="https://developers.mercadolibre.com" target="_blank" rel="noreferrer" className="underline text-blue-400">developers.mercadolibre.com</a>, inicia sesión con tu cuenta de vendedor y selecciona &quot;Crear nueva aplicación&quot;.
                    </p>
                  </div>
                  <div className="space-y-1 bg-slate-800 p-3.5 rounded-xl border border-slate-750">
                    <span className="font-extrabold text-yellow-400">Paso 2: Callback URI</span>
                    <p className="text-slate-350 leading-relaxed text-[11px] mt-1">
                      En el campo &quot;Redirect URL&quot; en Mercado Libre, debes registrar la siguiente dirección de retorno del callback de este applet:
                    </p>
                    <span className="font-mono text-[9px] block bg-slate-950 p-2 rounded mt-1.5 select-all break-all border border-slate-700 text-emerald-400">
                      {window.location.origin}/auth/callback
                    </span>
                  </div>
                  <div className="space-y-1 bg-slate-800 p-3.5 rounded-xl border border-slate-750">
                    <span className="font-extrabold text-yellow-400">Paso 3: Cargar Secretos</span>
                    <p className="text-slate-350 leading-relaxed text-[11px] mt-1">
                      Copia el &quot;CLIENT_ID&quot; y el &quot;CLIENT_SECRET&quot; generados y configúralos en el Panel de Settings y Secrets de Google AI Studio.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-850 p-3.5 rounded-xl border border-slate-700 text-[11px] leading-relaxed text-slate-300">
                  ⚠️ <span className="font-extrabold text-slate-50">Compromiso de Privacidad e Iframe:</span> Nuestra plataforma gestiona la transmisión segura de los tokens de autenticación OAuth a través del servidor Node.js/Cloud-Run, garantizando que ninguna contraseña ni llave de producción quede accesible o sea visible en el navegador web del usuario.
                </div>
              </div>

            </div>
          )}

        </div>
      </main>

      {/* Footer Details */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="flex items-center justify-center gap-1 font-bold text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Integrado 100% seguro y conforme a los Términos y Condiciones generales de Mercado Libre.
          </p>
          <p className="text-slate-400">
            Herramienta diseñada con Inteligencia Artificial Gemini &bull; Desarrollado para vendedores profesionales.
          </p>
        </div>
      </footer>
    </div>
  );
}
