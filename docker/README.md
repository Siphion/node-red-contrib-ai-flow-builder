# Dev docker

```bash
docker compose up
```

- Node-RED 4.1 on http://localhost:1880
- Data persisted in `./data` (gitignored)
- This package mounted read/write at `/data/node_modules/node-red-contrib-ai-flow-builder`
- Restart the container after changing node-side code: `docker compose restart`
- Browser-only (HTML/JS) changes need a hard reload of the Node-RED editor
