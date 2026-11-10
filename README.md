# Mahjong Rack Helper

Tap in your American mahjong rack and get Charleston pass suggestions, the card sections you're closest to, and quick rules.

A static site: no build step, no backend. Your card and rack are saved in your browser's localStorage.

## Run locally
```
npx serve .        # or: python3 -m http.server
npm test           # engine tests (Node 18+)
```

## Deploy
GitHub → Settings → Pages → Source: **Deploy from a branch** → `main` / `(root)`.

## Card data
The card lives only in your browser (paste it in via **Card**). Don't commit it: the NMJL card is copyrighted. `my-card.txt` is gitignored if you want to keep a local copy.

## Layout
- `js/engine.js`: card parsing, hand matching, Charleston logic (pure, tested)
- `js/app.js`: UI
- `css/styles.css`
