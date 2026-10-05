# ABRUM Database

A dynamic database app for ABRUM. Tables, columns and rows are signed twins in the Room; people work with them through a shadcn/ui + TanStack Table interface, agents through tool calls.

## Data model (twins)

| Entity | Fields | Notes |
|---|---|---|
| `table` | `key` (unique), `name`, `description?`, `itemName?`, `order` | One tab. `key` is the agent-facing id. |
| `column` | `tableKey`, `key`, `label`, `type`, `config?`, `required?`, `hidden?`, `order` | Schema of a table, editable at runtime. |
| `row` | `tableKey`, `id`, `values` | `values` maps column keys to stored values. |

Column types: `text`, `longText`, `number`, `currency`, `percent`, `rating`, `select`, `multiSelect`, `person`, `date`, `checkbox`, `url`, `email`, `phone`, `image`, `trend`.

`config` holds type settings: `options` (`{value, label?, color?, image?}`), `currency`, `decimals`, `max`, `section` (form grouping), `placeholder`, `description`, `aggregate` (`sum|avg|min|max|count` in the footer), `width`.

Twins reject floats, so `number` and `currency` are stored as integers scaled by `10^decimals` (currency defaults to 2). Agents always read and write display units. Images are stored as `blob:<hash>` (uploaded to the Station) or https URLs.

## Agent tools

Offer `read`: `listTables`, `describeTable`, `queryRows` (search, filters, sort, paging).
Offer `manage`: `createTable`, `updateTable`, `deleteTable`, `addColumn`, `updateColumn` (incl. type conversion of existing values and reordering), `removeColumn`, `addRows`, `updateRows`, `deleteRows`.

Values are matched by column key or label; unknown select options are added automatically.

## UI

Tabs per table, search, filters, sorting (toolbar and column headers), column visibility, CSV/JSON export, bulk delete, footer calculations, a generated "New item" dialog with image upload/preview, and an editable details sheet. Adding and editing columns is possible in the UI; everything else about the schema is available to agents.

## Development

```bash
npm install
npm test                 # backend tool tests against an in-memory ctx.db
npm run preview:ui       # UI preview without a Station (in-memory @abrum/react)
abrum app check --app .  # codegen, build, portability and station-js checks
```

Edit `abrum.app.ts`, `src/`, `backend/actions.js`. `generated/` and `abrum.app.json` are produced by codegen.
