# Roblox 2007 server

Run locally:   node server.js     then open http://localhost:3000
Owner:         yuoop31 (change with env var OWNER_NAME). Sign up as yuoop31 FIRST, before sharing the link.
Accounts:      saved in data/users.json (env DATA_DIR changes the folder). Passwords are salted + scrypt-hashed.

Hosting (needs Node 16+, no npm install needed):
- Render / Railway / Fly.io: create a Node web service from this folder, start command `node server.js`.
- Attach a persistent disk and set DATA_DIR to its path, or accounts are wiped on every redeploy.
- Put it behind HTTPS (these hosts do that for you).
