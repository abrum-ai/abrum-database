import { defineApp, abrum } from "@abrum/app";

// Column types understood by the UI and the backend. Keep in sync with
// src/lib/columns.ts and backend/actions.js.
const COLUMN_TYPES =
  "text | longText | number | currency | percent | rating | select | multiSelect | person | date | checkbox | url | email | phone | image | trend";

const TABLE_REF = "Table key (e.g. \"companies\") or exact table name.";

export default defineApp({
  id: "abrum.table",
  title: "Table",
  icon: "table",
  description: "Dynamic tables stored as signed twins. People and agents can define columns, add rows, search, filter, sort and export.",
  entities: {
    // One table (shown as a tab). `key` is the stable, agent-friendly id.
    table: abrum.collection({
      key: abrum.string().unique(),
      name: abrum.string(),
      description: abrum.string().optional(),
      itemName: abrum.string().optional(),
      order: abrum.number(),
      createdAtMs: abrum.createdAt(),
      updatedAtMs: abrum.updatedAt(),
    }),
    // One column definition. `config` holds type-specific settings such as
    // select options, currency, decimals, section and aggregate.
    column: abrum.collection({
      tableKey: abrum.string().index(),
      key: abrum.string().index(),
      label: abrum.string(),
      type: abrum.string(),
      config: abrum.json().optional(),
      required: abrum.boolean().optional(),
      hidden: abrum.boolean().optional(),
      order: abrum.number(),
      createdAtMs: abrum.createdAt(),
      updatedAtMs: abrum.updatedAt(),
    }),
    // One row. `values` maps column keys to stored values (integers only for
    // numbers: currency and decimals are stored in minor units).
    row: abrum.collection({
      tableKey: abrum.string().index(),
      id: abrum.string().index(),
      values: abrum.json(),
      createdAtMs: abrum.createdAt(),
      updatedAtMs: abrum.updatedAt(),
    }),
  },
  actions: {
    listTables: abrum.action({
      description: "List all tables in this Room with their keys, row counts and column summaries.",
      input: {},
      offer: "read",
      risk: "low",
    }),
    describeTable: abrum.action({
      description: `Return the full column schema of one table: key, label, type, config, required, hidden, order. table: ${TABLE_REF}`,
      input: { table: abrum.string() },
      offer: "read",
      risk: "low",
    }),
    queryRows: abrum.action({
      description:
        "Read rows of a table. Values are returned in display units (currency as decimal numbers). " +
        "search: case-insensitive text match across all columns. " +
        "filters: array of {column, op, value} with op one of eq | neq | contains | gt | gte | lt | lte | empty | notEmpty | in. " +
        "sort: {column, direction: asc|desc}. limit defaults to 50 (max 500), offset for paging. " +
        `table: ${TABLE_REF}`,
      input: {
        table: abrum.string(),
        search: abrum.string().optional(),
        filters: abrum.json().optional(),
        sort: abrum.json().optional(),
        limit: abrum.number().optional(),
        offset: abrum.number().optional(),
      },
      offer: "read",
      risk: "low",
    }),
    createTable: abrum.action({
      description:
        "Create a new table (tab). key is derived from name when omitted. itemName is the singular label for one row (e.g. \"Company\"). " +
        `Optional columns: array of column specs as in addColumn (label, type, key?, config?, required?). Types: ${COLUMN_TYPES}.`,
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
      description: `Delete a table with all its columns and rows. Requires confirm: true. table: ${TABLE_REF}`,
      input: { table: abrum.string(), confirm: abrum.boolean() },
      offer: "manage",
      risk: "medium",
    }),
    addColumn: abrum.action({
      description:
        `Add a column to a table. Types: ${COLUMN_TYPES}. ` +
        "config (all optional): options: [{value, label?, color?}] for select/multiSelect/person (color: gray|red|orange|amber|green|teal|blue|indigo|violet|pink); " +
        "currency: ISO code like \"EUR\" (currency type); decimals: integer digits after the decimal point (number/currency); " +
        "max: integer scale for rating (default 5); section: form section heading; placeholder; description; " +
        "aggregate: sum | avg | min | max | count shown in the table footer; width: pixels. " +
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
        "Edit a column: label, type, config (merged into the existing config; set a key to null to remove it), required, hidden, position. " +
        "Changing the type converts existing values where possible. column: column key or exact label. " +
        `table: ${TABLE_REF}`,
      input: {
        table: abrum.string(),
        column: abrum.string(),
        label: abrum.string().optional(),
        type: abrum.string().optional(),
        config: abrum.json().optional(),
        required: abrum.boolean().optional(),
        hidden: abrum.boolean().optional(),
        position: abrum.number().optional(),
      },
      offer: "manage",
      risk: "low",
    }),
    removeColumn: abrum.action({
      description: `Remove a column definition. Row values for it are dropped from view. column: column key or exact label. table: ${TABLE_REF}`,
      input: { table: abrum.string(), column: abrum.string() },
      offer: "manage",
      risk: "medium",
    }),
    addRows: abrum.action({
      description:
        "Add one or more rows. rows: array of objects mapping column key or label to a value in display units " +
        "(currency/number as numbers, percent 0-100, date as YYYY-MM-DD, multiSelect as array, select as option value or label, " +
        "trend as array of integers, image as https URL). Unknown select options are added automatically. " +
        `table: ${TABLE_REF}`,
      input: { table: abrum.string(), rows: abrum.json() },
      offer: "manage",
      risk: "low",
    }),
    updateRows: abrum.action({
      description:
        "Update rows. updates: array of {id, values} where values maps column key or label to the new value " +
        "(same units as addRows; null clears a value). Row ids come from queryRows. " +
        `table: ${TABLE_REF}`,
      input: { table: abrum.string(), updates: abrum.json() },
      offer: "manage",
      risk: "low",
    }),
    deleteRows: abrum.action({
      description: `Delete rows by id. ids: array of row ids from queryRows. table: ${TABLE_REF}`,
      input: { table: abrum.string(), ids: abrum.json() },
      offer: "manage",
      risk: "medium",
    }),
  },
  agent: {
    defaultOffer: "manage",
    offers: {
      read: { title: "Read tables" },
      manage: { title: "Manage tables, columns and rows" },
    },
  },
});
