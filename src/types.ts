export interface Product {
  id: string;
  title: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  characteristics: { key: string; value: string }[];
  sku?: string;
}

export interface Faq {
  id: string;
  category: string;
  question: string;
  answer: string;
  isActive: boolean;
}

export interface ComplianceRule {
  id: string;
  name: string;
  category: 'contact' | 'identity' | 'payment' | 'external' | 'general';
  description: string;
  pattern: RegExp | string;
  exampleViolation: string;
  severity: 'high' | 'medium';
}

export interface ComplianceIssue {
  ruleId: string;
  ruleName: string;
  severity: 'high' | 'medium';
  message: string;
  textPosition?: string;
  detectedText?: string;
}

export interface ComplianceReport {
  isCompliant: boolean;
  issues: ComplianceIssue[];
  score: number; // 0 to 100
  sanitizedText: string;
}

export interface SimulationResult {
  rawQuestion: string;
  aiResponse: string;
  confidence: number;
  complianceReport: ComplianceReport;
  sourcesUsed: {
    productDetailsUsed: boolean;
    faqUsed: string[];
  };
}
