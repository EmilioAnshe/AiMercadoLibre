if (typeof globalThis.DOMException === 'undefined') {
  // Fallback for older environments if ever loaded, but modern Node has it
  globalThis.DOMException = class DOMException extends Error {
    constructor(message, name) {
      super(message);
      this.name = name || 'DOMException';
    }
  };
}

module.exports = globalThis.DOMException;
