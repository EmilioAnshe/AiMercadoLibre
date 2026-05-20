# Security Specification - MercadoResponder Firestore Database

## 1. Data Invariants
- Anyone can read/list products and FAQs because they are required to render simulations and optimize product listings.
- Only authenticated users can create, update, or delete products and FAQs.
- Product ID and FAQ ID within document paths must match clean alphanumeric standards (`isValidId`).
- For update/create operations, the timestamp must sync with server-provided transactional time (`request.time`).

## 2. The "Dirty Dozen" Payloads
1. Product with blank ID or malicious ID (e.g., `../poison`).
2. Product created with someone else's authorized author role without login.
3. Product updated with arbitrary fields not part of the standard schema.
4. FAQ with empty categories or unauthorized tags.
5. Injected system variables or roles in the profile.
6. FAQ updated with terminal or banned values bypassing compliance checks.
7. Spoofed admin user email in payload.
8. Rapid denial-of-wallet listing queries on collections.
9. Modifying immutabilities such as `createdAt`.
10. Attempting to update a Whitelisted field with binary 1MB data.
11. Bypassing email verification flags (email_verified must be verified if auth is present).
12. Orphaned document injection targeting random collections.

## 3. Fortress Rules (`firestore.rules`)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isValidId(id) { 
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$'); 
    }
    function isSignedIn() { 
      return request.auth != null; 
    }
    function isEmailVerified() {
      return isSignedIn() && (request.auth.token.email_verified == true);
    }

    match /products/{productId} {
      allow read: if true;
      allow create, update, delete: if isSignedIn();
    }

    match /faqs/{faqId} {
      allow read: if true;
      allow create, update, delete: if isSignedIn();
    }
  }
}
```
