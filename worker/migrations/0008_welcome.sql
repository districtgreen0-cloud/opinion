-- Welcome email: set once the first welcome mail was accepted by Email Service (src/mail.ts sendWelcome).
ALTER TABLE accounts ADD COLUMN welcomed_at INTEGER;
