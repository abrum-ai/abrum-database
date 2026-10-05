import { defineApp, abrum } from "@abrum/app";

// Column types understood by the UI and the backend. Keep in sync with
// src/lib/columns.ts and backend/src/actions.js.
const COLUMN_TYPES =
  "text | longText | number | currency | percent | rating | select | multiSelect | person | date | checkbox | url | email | phone | image | trend | relation | rollup | formula | createdTime | editedTime";

const TABLE_REF = "Table key (e.g. \"companies\") or exact table name.";

const CONFIG_HELP =
  "config (all optional unless noted): options: [{value, label?, color?}] for select/multiSelect/person (color: gray|red|orange|amber|green|teal|blue|indigo|violet|pink); " +
  "currency: ISO code like \"EUR\"; decimals: digits after the decimal point (number/currency, default 2 for currency); max: rating scale (default 5); " +
  "relation: tableKey (required, the related table) and single (true = at most one linked row); " +
  "rollup: relation (required, a relation column of this table), fn (count | countValues | countUnique | sum | avg | min | max | show | percentChecked | earliest | latest) and property (column of the related table, required unless fn is count); " +
  "formula: expression (required, Notion-style, e.g. prop(\"Price\") * prop(\"Qty\"), if(prop(\"Due\") < today(), \"late\", \"ok\"), dateBetween(prop(\"End\"), prop(\"Start\"), \"days\")) and format (number | currency | percent | text | date | checkbox); " +
  "section: form section heading; placeholder; description; aggregate: sum | avg | min | max | count | countEmpty | countNotEmpty shown in the table footer; width in pixels.";

const VIEW_HELP =
  "View config (all optional): filters: [{column, op, value}] with op eq | neq | contains | gt | gte | lt | lte | empty | notEmpty | in; filterMode: and | or; " +
  "sorts: [{column, direction: asc | desc}]; columns: [{key, hidden?, width?}] (order and visibility); groupBy: select/person/checkbox column for boards; " +
  "cover: image column for gallery/board cards; cardColumns: column keys shown on cards; wrap: true wraps cell text.";

export default defineApp({
  id: "abrum.database",
  title: "Database",
  icon: "database",
  description: "Databases stored as signed twins: tables with typed columns, relations, rollups and formulas, shared views (table, board, gallery, list) and a page per row. People and agents can extend the schema at any time.",
  sidebar: {
    contextLabel: {
      fallback: "appTitle",
      source: { contentType: "abrum_database_config", field: "title", orderBy: "updatedAtMs" },
    },
    createRoom: { label: "Add Database", defaultAgentOfferId: "abrum.database.manage" },
    roomActions: [{ id: "table.create", label: "Add table", icon: "plus", primary: true, navigationOnly: true }],
  },
  entities: {
    config: abrum.entity({
      title: abrum.string(),
      createdAtMs: abrum.createdAt(),
      updatedAtMs: abrum.updatedAt(),
    }).type("abrum_database_config").roomScoped(),
    // One table. `key` is the stable, agent-facing id.
    table: abrum.collection({
      key: abrum.string().unique(),
      name: abrum.string(),
      description: abrum.string().optional(),
      itemName: abrum.string().optional(),
      order: abrum.number(),
      createdAtMs: abrum.createdAt(),
      updatedAtMs: abrum.updatedAt(),
    }).type("abrum_table"),
    // One property (column) definition. `config` holds type-specific settings.
    column: abrum.collection({
      tableKey: abrum.string().index(),
      key: abrum.string().index(),
      label: abrum.string(),
      // "kind", not "type": `type` is the twin's content discriminator.
      kind: abrum.string(),
      config: abrum.json().optional(),
      required: abrum.boolean().optional(),
      order: abrum.number(),
      createdAtMs: abrum.createdAt(),
      updatedAtMs: abrum.updatedAt(),
    }).type("abrum_table_column"),
    // A saved, shared view of a table: layout plus filters, sorts, visible
    // columns, widths and grouping.
    view: abrum.collection({
      tableKey: abrum.string().index(),
      key: abrum.string().index(),
      name: abrum.string(),
      layout: abrum.string(),
      config: abrum.json().optional(),
      order: abrum.number(),
      createdAtMs: abrum.createdAt(),
      updatedAtMs: abrum.updatedAt(),
    }).type("abrum_table_view"),
    // One row (item). `values` maps column keys to stored values (integers
    // only: currency and decimals are stored in minor units). `body` is the
    // row's page content in Markdown.
    row: abrum.collection({
      tableKey: abrum.string().index(),
      id: abrum.string().index(),
      values: abrum.json(),
      body: abrum.string().optional(),
      createdAtMs: abrum.createdAt(),
      updatedAtMs: abrum.updatedAt(),
    }).type("abrum_table_row"),
  },
  actions: {
    renameDatabase: abrum.action({
      description: "Rename this Database app in its exact Room without changing the Space or any table, column, view or row.",
      input: { title: abrum.string() },
      offer: "manage",
      risk: "low",
    }),
    listTables: abrum.action({
      description: "List all tables in this Room with keys, row counts, columns and views.",
      input: {},
      offer: "read",
      risk: "low",
    }),
    describeTable: abrum.action({
      description: `Return the full schema of one table: columns (key, label, type, config, required, order) and views (key, name, layout, config). table: ${TABLE_REF}`,
      input: { table: abrum.string() },
      offer: "read",
      risk: "low",
    }),
    queryRows: abrum.action({
      description:
        "Read rows of a table. Values are returned in display units (currency as decimal numbers, relations as [{id, title}], formulas and rollups computed). " +
        "view: apply a saved view's filters and sorts. search: case-insensitive text match across all columns and page content. " +
        "filters: array of {column, op, value} with op eq | neq | contains | gt | gte | lt | lte | empty | notEmpty | in. " +
        "sort: {column, direction: asc|desc}. limit defaults to 50 (max 500), offset for paging. includeBody: also return each row's page content. " +
        `table: ${TABLE_REF}`,
      input: {
        table: abrum.string(),
        view: abrum.string().optional(),
        search: abrum.string().optional(),
        filters: abrum.json().optional(),
        sort: abrum.json().optional(),
        limit: abrum.number().optional(),
        offset: abrum.number().optional(),
        includeBody: abrum.boolean().optional(),
      },
      offer: "read",
      risk: "low",
    }),
    getRow: abrum.action({
      description: `Read one row with all values and its page content (Markdown body). id: row id from queryRows. table: ${TABLE_REF}`,
      input: { table: abrum.string(), id: abrum.string() },
      offer: "read",
      risk: "low",
    }),
    createTable: abrum.action({
      description:
        "Create a new table (database tab) with a default \"All\" table view. key is derived from name when omitted. itemName is the singular label for one row (e.g. \"Company\"). " +
        `columns: array of column specs as in addColumn ({label, type, key?, config?, required?}); defaults to one Name column. Types: ${COLUMN_TYPES}.`,
      input: {
        name: abrum.string(),
        key: abrum.string().optional(),
        description: abrum.string().optional(),
        itemName: abrum.string().optional(),
        columns: abrum.json().optional(),
      },
      offer: "manage",
      risk: "low",
    }),
    updateTable: abrum.action({
      description: `Rename a table or change its description, itemName or tab order. table: ${TABLE_REF}`,
      input: {
        table: abrum.string(),
        name: abrum.string().optional(),
        description: abrum.string().optional(),
        itemName: abrum.string().optional(),
        order: abrum.number().optional(),
      },
      offer: "manage",
      risk: "low",
    }),
    deleteTable: abrum.action({
      description: `Delete a table with all its columns, views and rows. Requires confirm: true. table: ${TABLE_REF}`,
      input: { table: abrum.string(), confirm: abrum.boolean(), expectedLineageCid: abrum.string().optional() },
      offer: "manage",
      risk: "medium",
    }),
    addColumn: abrum.action({
      description:
        `Add a column (property) to a table. Types: ${COLUMN_TYPES}. ${CONFIG_HELP} ` +
        "position: 0-based index to insert at (default end). " +
        `table: ${TABLE_REF}`,
      input: {
        table: abrum.string(),
        label: abrum.string(),
        type: abrum.string(),
        key: abrum.string().optional(),
        config: abrum.json().optional(),
        required: abrum.boolean().optional(),
        position: abrum.number().optional(),
      },
      offer: "manage",
      risk: "low",
    }),
    updateColumn: abrum.action({
      description:
        "Edit a column: label, type, config (merged into the existing config; set a key to null to remove it), required, position. " +
        "Changing between stored types converts existing values where possible. column: column key or exact label. " +
        `table: ${TABLE_REF}`,
      input: {
        table: abrum.string(),
        column: abrum.string(),
        label: abrum.string().optional(),
        type: abrum.string().optional(),
        config: abrum.json().optional(),
        required: abrum.boolean().optional(),
        position: abrum.number().optional(),
      },
      offer: "manage",
      risk: "low",
    }),
    removeColumn: abrum.action({
      description: `Remove a column definition. Row values for it are no longer shown. column: column key or exact label. table: ${TABLE_REF}`,
      input: { table: abrum.string(), column: abrum.string() },
      offer: "manage",
      risk: "medium",
    }),
    addRows: abrum.action({
      description:
        "Add one or more rows (max 500 per call). rows: array of objects mapping column key or label to a value in display units " +
        "(currency/number as numbers, percent 0-100, date as YYYY-MM-DD, multiSelect as array, select as option value or label, relation as row ids or titles of the related table, " +
        "trend as array of integers, image as https URL); formulas, rollups and times are computed and cannot be set. " +
        "To also set page content use {values: {...}, body: \"Markdown\"}. Unknown select options are added automatically. " +
        `table: ${TABLE_REF}`,
      input: { table: abrum.string(), rows: abrum.json() },
      offer: "manage",
      risk: "low",
    }),
    updateRows: abrum.action({
      description:
        "Update rows (max 500 per call). updates: array of {id, values?, body?} where values maps column key or label to the new value " +
        "(same units as addRows; null clears a value) and body replaces the page content (Markdown). Row ids come from queryRows. " +
        `table: ${TABLE_REF}`,
      input: { table: abrum.string(), updates: abrum.json() },
      offer: "manage",
      risk: "low",
    }),
    deleteRows: abrum.action({
      description: `Delete rows by id (max 500 per call). ids: array of row ids from queryRows. table: ${TABLE_REF}`,
      input: { table: abrum.string(), ids: abrum.json() },
      offer: "manage",
      risk: "medium",
    }),
    createView: abrum.action({
      description: `Create a shared view of a table. layout: table | board | gallery | list. ${VIEW_HELP} table: ${TABLE_REF}`,
      input: { table: abrum.string(), name: abrum.string(), layout: abrum.string().optional(), config: abrum.json().optional() },
      offer: "manage",
      risk: "low",
    }),
    updateView: abrum.action({
      description: `Change a view's name, layout, order or config (merged; null removes a key). ${VIEW_HELP} view: view key or name. table: ${TABLE_REF}`,
      input: {
        table: abrum.string(),
        view: abrum.string(),
        name: abrum.string().optional(),
        layout: abrum.string().optional(),
        config: abrum.json().optional(),
        order: abrum.number().optional(),
      },
      offer: "manage",
      risk: "low",
    }),
    deleteView: abrum.action({
      description: `Delete a view (a table keeps at least one). view: view key or name. table: ${TABLE_REF}`,
      input: { table: abrum.string(), view: abrum.string() },
      offer: "manage",
      risk: "low",
    }),
  },
  agent: {
    defaultOffer: "manage",
    offers: {
      read: { title: "Read tables" },
      manage: { title: "Manage tables, columns, views and rows" },
    },
  },
});
