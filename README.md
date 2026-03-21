# Hackerhouse Globe

Interactive 3D globe for exploring hacker houses around the world.

## What this project does

- Renders a globe using `globe.gl` + `three.js`.
- Shows a curated dataset of **77 hacker houses** in [`src/data/hackerhouses.js`](src/data/hackerhouses.js).
- Supports search by house name, city, country, region, focus, and summary.
- Opens a details card when a marker is selected, including a quick external link.
- Lets users customize marker models (orb, house, car, skyscraper, temple), persisted in `localStorage`.

## Tech stack

- Vite
- JavaScript (ES modules)
- globe.gl
- three.js

## Getting started

### Requirements

- Node.js 18+ (or Bun)

### Install dependencies

```bash
npm install
```

or

```bash
bun install
```

### Run locally

```bash
npm run dev
```

or

```bash
bun run dev
```

### Build for production

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Project structure

```text
.
├─ index.html
├─ src/
│  ├─ main.js                # Globe setup, interactions, filtering, marker rendering
│  ├─ style.css              # UI styles
│  └─ data/
│     └─ hackerhouses.js     # Hacker house dataset
└─ package.json
```

## Updating the dataset

Each entry in `src/data/hackerhouses.js` is a plain object with fields like:

- `id`, `name`, `city`, `country`, `region`
- `lat`, `lng`
- `focus`, `status`
- `website`, `summary`

Add or edit entries in that file, then reload the app.

## Link

- Repository: [https://github.com/VicPitic/hackerhouse-globe](https://github.com/VicPitic/hackerhouse-globe)
