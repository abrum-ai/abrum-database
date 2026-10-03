import { abrum, type AbrumAppFunctionDef, type AbrumEntityRecord, type AbrumInstallAppOptions } from "@abrum/web-runtime";

export const TABLE_APP_ID = "abrum.table";
export const TABLE_APP_VERSION = "0.1.0";
export const TABLE_SCHEMA_NAME = "abrum.table.table.v1";
export const COLUMN_SCHEMA_NAME = "abrum.table.column.v1";
export const ROW_SCHEMA_NAME = "abrum.table.row.v1";

export interface ListTablesInput {

}

export interface DescribeTableInput {
  table: string;
}

export interface QueryRowsInput {
  table: string;
  search?: string;
  filters?: unknown;
  sort?: unknown;
  limit?: number;
  offset?: number;
}

export interface CreateTableInput {
  name: string;
  key?: string;
  description?: string;
  itemName?: string;
  columns?: unknown;
}

export interface UpdateTableInput {
  table: string;
  name?: string;
  description?: string;
  itemName?: string;
  order?: number;
}

export interface DeleteTableInput {
  table: string;
  confirm: boolean;
}

export interface AddColumnInput {
  table: string;
  label: string;
  type: string;
  key?: string;
  config?: unknown;
  required?: boolean;
  position?: number;
}

export interface UpdateColumnInput {
  table: string;
  column: string;
  label?: string;
  type?: string;
  config?: unknown;
  required?: boolean;
  hidden?: boolean;
  position?: number;
}

export interface RemoveColumnInput {
  table: string;
  column: string;
}

export interface AddRowsInput {
  table: string;
  rows: unknown;
}

export interface UpdateRowsInput {
  table: string;
  updates: unknown;
}

export interface DeleteRowsInput {
  table: string;
  ids: unknown;
}

export const tableApp = abrum.app("abrum.table", {
  table: abrum.entity({
    key: abrum.string().unique(),
    name: abrum.string(),
    description: abrum.string().optional(),
    itemName: abrum.string().optional(),
    order: abrum.number(),
    createdAtMs: abrum.date().index(),
    updatedAtMs: abrum.date(),
  }).named("abrum.table.table.v1").roomScoped(),
  column: abrum.entity({
    tableKey: abrum.string().index(),
    key: abrum.string().index(),
    label: abrum.string(),
    type: abrum.string(),
    config: abrum.json().optional(),
    required: abrum.boolean().optional(),
    hidden: abrum.boolean().optional(),
    order: abrum.number(),
    createdAtMs: abrum.date().index(),
    updatedAtMs: abrum.date(),
  }).named("abrum.table.column.v1").roomScoped(),
  row: abrum.entity({
    tableKey: abrum.string().index(),
    id: abrum.string().index(),
    values: abrum.json(),
    createdAtMs: abrum.date().index(),
    updatedAtMs: abrum.date(),
  }).named("abrum.table.row.v1").roomScoped(),
}, {
  functions: {
    listTables: {"name":"listTables"} as AbrumAppFunctionDef<ListTablesInput>,
    describeTable: {"name":"describeTable"} as AbrumAppFunctionDef<DescribeTableInput>,
    queryRows: {"name":"queryRows"} as AbrumAppFunctionDef<QueryRowsInput>,
    createTable: {"name":"createTable"} as AbrumAppFunctionDef<CreateTableInput>,
    updateTable: {"name":"updateTable"} as AbrumAppFunctionDef<UpdateTableInput>,
    deleteTable: {"name":"deleteTable"} as AbrumAppFunctionDef<DeleteTableInput>,
    addColumn: {"name":"addColumn"} as AbrumAppFunctionDef<AddColumnInput>,
    updateColumn: {"name":"updateColumn"} as AbrumAppFunctionDef<UpdateColumnInput>,
    removeColumn: {"name":"removeColumn"} as AbrumAppFunctionDef<RemoveColumnInput>,
    addRows: {"name":"addRows"} as AbrumAppFunctionDef<AddRowsInput>,
    updateRows: {"name":"updateRows"} as AbrumAppFunctionDef<UpdateRowsInput>,
    deleteRows: {"name":"deleteRows"} as AbrumAppFunctionDef<DeleteRowsInput>,
  },
});
export const app = tableApp;

export type TableRecord = AbrumEntityRecord<(typeof tableApp.entities)["table"]>;
export type ColumnRecord = AbrumEntityRecord<(typeof tableApp.entities)["column"]>;
export type RowRecord = AbrumEntityRecord<(typeof tableApp.entities)["row"]>;

export const tableInstallManifest: AbrumInstallAppOptions = {
  "appId": "abrum.table",
  "title": "Table",
  "icon": "table",
  "description": "Dynamic tables stored as signed twins. People and agents can define columns, add rows, search, filter, sort and export.",
  "kind": "web",
  "appVersion": "0.1.0",
  "executionLevel": "trusted-plugin",
  "schemas": [
    {
      "entity": "table",
      "name": "abrum.table.table.v1",
      "contentType": "table",
      "schema": {
        "type": "object",
        "required": [
          "type",
          "key",
          "name",
          "order",
          "createdAtMs",
          "updatedAtMs"
        ],
        "properties": {
          "type": {
            "const": "table"
          },
          "key": {
            "type": "string",
            "x-abrum-indexed": true,
            "x-abrum-unique": true
          },
          "name": {
            "type": "string",
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "description": {
            "type": "string",
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "itemName": {
            "type": "string",
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "order": {
            "type": "integer",
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "createdAtMs": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "string",
                "format": "date-time"
              }
            ],
            "x-abrum-indexed": true,
            "x-abrum-unique": false
          },
          "updatedAtMs": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "string",
                "format": "date-time"
              }
            ],
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          }
        },
        "additionalProperties": true,
        "x-abrum": {
          "app": "abrum.table",
          "entity": "table",
          "schemaName": "abrum.table.table.v1",
          "scope": "room",
          "indexed": [
            "key",
            "createdAtMs"
          ],
          "unique": [
            "key"
          ]
        }
      }
    },
    {
      "entity": "column",
      "name": "abrum.table.column.v1",
      "contentType": "column",
      "schema": {
        "type": "object",
        "required": [
          "type",
          "tableKey",
          "key",
          "label",
          "type",
          "order",
          "createdAtMs",
          "updatedAtMs"
        ],
        "properties": {
          "type": {
            "type": "string",
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "tableKey": {
            "type": "string",
            "x-abrum-indexed": true,
            "x-abrum-unique": false
          },
          "key": {
            "type": "string",
            "x-abrum-indexed": true,
            "x-abrum-unique": false
          },
          "label": {
            "type": "string",
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "config": {
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "required": {
            "type": "boolean",
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "hidden": {
            "type": "boolean",
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "order": {
            "type": "integer",
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "createdAtMs": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "string",
                "format": "date-time"
              }
            ],
            "x-abrum-indexed": true,
            "x-abrum-unique": false
          },
          "updatedAtMs": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "string",
                "format": "date-time"
              }
            ],
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          }
        },
        "additionalProperties": true,
        "x-abrum": {
          "app": "abrum.table",
          "entity": "column",
          "schemaName": "abrum.table.column.v1",
          "scope": "room",
          "indexed": [
            "tableKey",
            "key",
            "createdAtMs"
          ],
          "unique": []
        }
      }
    },
    {
      "entity": "row",
      "name": "abrum.table.row.v1",
      "contentType": "row",
      "schema": {
        "type": "object",
        "required": [
          "type",
          "tableKey",
          "id",
          "values",
          "createdAtMs",
          "updatedAtMs"
        ],
        "properties": {
          "type": {
            "const": "row"
          },
          "tableKey": {
            "type": "string",
            "x-abrum-indexed": true,
            "x-abrum-unique": false
          },
          "id": {
            "type": "string",
            "x-abrum-indexed": true,
            "x-abrum-unique": false
          },
          "values": {
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "createdAtMs": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "string",
                "format": "date-time"
              }
            ],
            "x-abrum-indexed": true,
            "x-abrum-unique": false
          },
          "updatedAtMs": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "string",
                "format": "date-time"
              }
            ],
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          }
        },
        "additionalProperties": true,
        "x-abrum": {
          "app": "abrum.table",
          "entity": "row",
          "schemaName": "abrum.table.row.v1",
          "scope": "room",
          "indexed": [
            "tableKey",
            "id",
            "createdAtMs"
          ],
          "unique": []
        }
      }
    }
  ],
  "features": [],
  "functions": [
    {
      "id": "listTables",
      "description": "List all tables in this Room with their keys, row counts and column summaries.",
      "input": {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": false
      }
    },
    {
      "id": "describeTable",
      "description": "Return the full column schema of one table: key, label, type, config, required, hidden, order. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          }
        },
        "required": [
          "table"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "queryRows",
      "description": "Read rows of a table. Values are returned in display units (currency as decimal numbers). search: case-insensitive text match across all columns. filters: array of {column, op, value} with op one of eq | neq | contains | gt | gte | lt | lte | empty | notEmpty | in. sort: {column, direction: asc|desc}. limit defaults to 50 (max 500), offset for paging. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "search": {
            "type": "string"
          },
          "filters": {},
          "sort": {},
          "limit": {
            "type": "integer"
          },
          "offset": {
            "type": "integer"
          }
        },
        "required": [
          "table"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "createTable",
      "description": "Create a new table (tab). key is derived from name when omitted. itemName is the singular label for one row (e.g. \"Company\"). Optional columns: array of column specs as in addColumn (label, type, key?, config?, required?). Types: text | longText | number | currency | percent | rating | select | multiSelect | person | date | checkbox | url | email | phone | image | trend.",
      "input": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "key": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "itemName": {
            "type": "string"
          },
          "columns": {}
        },
        "required": [
          "name"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "updateTable",
      "description": "Rename a table or change its description, itemName or tab order. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "itemName": {
            "type": "string"
          },
          "order": {
            "type": "integer"
          }
        },
        "required": [
          "table"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "deleteTable",
      "description": "Delete a table with all its columns and rows. Requires confirm: true. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "confirm": {
            "type": "boolean"
          }
        },
        "required": [
          "table",
          "confirm"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "addColumn",
      "description": "Add a column to a table. Types: text | longText | number | currency | percent | rating | select | multiSelect | person | date | checkbox | url | email | phone | image | trend. config (all optional): options: [{value, label?, color?}] for select/multiSelect/person (color: gray|red|orange|amber|green|teal|blue|indigo|violet|pink); currency: ISO code like \"EUR\" (currency type); decimals: integer digits after the decimal point (number/currency); max: integer scale for rating (default 5); section: form section heading; placeholder; description; aggregate: sum | avg | min | max | count shown in the table footer; width: pixels. position: 0-based index to insert at (default end). table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "label": {
            "type": "string"
          },
          "type": {
            "type": "string"
          },
          "key": {
            "type": "string"
          },
          "config": {},
          "required": {
            "type": "boolean"
          },
          "position": {
            "type": "integer"
          }
        },
        "required": [
          "table",
          "label",
          "type"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "updateColumn",
      "description": "Edit a column: label, type, config (merged into the existing config; set a key to null to remove it), required, hidden, position. Changing the type converts existing values where possible. column: column key or exact label. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "column": {
            "type": "string"
          },
          "label": {
            "type": "string"
          },
          "type": {
            "type": "string"
          },
          "config": {},
          "required": {
            "type": "boolean"
          },
          "hidden": {
            "type": "boolean"
          },
          "position": {
            "type": "integer"
          }
        },
        "required": [
          "table",
          "column"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "removeColumn",
      "description": "Remove a column definition. Row values for it are dropped from view. column: column key or exact label. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "column": {
            "type": "string"
          }
        },
        "required": [
          "table",
          "column"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "addRows",
      "description": "Add one or more rows. rows: array of objects mapping column key or label to a value in display units (currency/number as numbers, percent 0-100, date as YYYY-MM-DD, multiSelect as array, select as option value or label, trend as array of integers, image as https URL). Unknown select options are added automatically. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "rows": {}
        },
        "required": [
          "table",
          "rows"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "updateRows",
      "description": "Update rows. updates: array of {id, values} where values maps column key or label to the new value (same units as addRows; null clears a value). Row ids come from queryRows. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "updates": {}
        },
        "required": [
          "table",
          "updates"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "deleteRows",
      "description": "Delete rows by id. ids: array of row ids from queryRows. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "ids": {}
        },
        "required": [
          "table",
          "ids"
        ],
        "additionalProperties": false
      }
    }
  ],
  "surfaces": [
    {
      "kind": "web",
      "label": "Table",
      "entrypoint": "/"
    }
  ],
  "background": null,
  "runtime": {
    "entrypoint": "backend/actions.js",
    "kind": "station-js",
    "backendDigest": "83044e618ced4e0f9d03a3785630781b"
  },
  "grantedRights": [
    "read",
    "write"
  ]
};
export const install = tableInstallManifest;
