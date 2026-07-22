# Yuma Reporting

A React web app for managing inventory across multiple vending machines. It runs
on the **HAHA Vending OpenAPI** — the same API and data model used by the
`hahamobile` app — so it reads live markets (machines), planograms, products,
per-machine inventory, sales and restock records.

## Features

- **Dashboard** — machines online, total units in stock, low/out-of-stock count,
  revenue today, and the products that need restocking soonest.
- **Machines** — searchable, filterable grid of every vending machine with live
  online status and stock totals.
- **Machine detail** — full planogram (layers × slots) with per-slot stock,
  capacity, price and low-stock severity, plus a per-machine product breakdown.
- **Inventory** — every product across the whole estate with fill levels and an
  expandable per-machine stock breakdown.
- **Restock** — machines that need a visit, a consolidated packing list (“what to
  bring”), and recent restock activity.
- **Alerts** — low-stock and out-of-stock alerts across all machines.
- **Products** — the product catalog with prices and total stock.

## Getting started

```bash
npm install
npm run dev
```

Then open the app (default http://localhost:5180) and sign in with your HAHA
OpenAPI **App Key** and **App Secret**. Choose the **Test** or **Production**
environment. Credentials are stored in the browser's `localStorage` and reused on
the next visit.

## API / CORS

The HAHA OpenAPI hosts do not send CORS headers, so the browser cannot call them
directly. In development, requests are proxied through Vite:

| App prefix    | Proxied to                                     |
| ------------- | ---------------------------------------------- |
| `/haha-test`  | `https://thor-openapi-test.hahavending.com`    |
| `/haha-prod`  | `https://thor-openapi.hahavending.com`         |

See `vite.config.js`. For a production deployment, serve the built `dist/` behind
a reverse proxy that forwards the same two prefixes to the HAHA hosts.

## Structure

```
src/
  api/         HAHA API layer (client, resources, mappers, analytics, stock insights)
  context/     ApiContext (auth) + AppContext (data loading)
  components/  Layout + shared UI
  pages/       Dashboard, Machines, Machine detail, Inventory, Restock, Alerts, Products
```

The `src/api` layer is ported from `hahamobile` so both apps speak to the API in
exactly the same way.
