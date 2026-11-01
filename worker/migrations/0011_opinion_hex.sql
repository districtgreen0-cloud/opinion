-- The registration OPINION lives in a hex the user picks. Kept so the ticket window can turn it into a draw entry once the X handle is saved.
ALTER TABLE accounts ADD COLUMN opinion_cell TEXT;
ALTER TABLE accounts ADD COLUMN opinion_comment TEXT;
