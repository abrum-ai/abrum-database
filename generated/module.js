export const abrumModule = {
  "__abrumModule": true,
  "appId": "abrum.table",
  "package": "@abrum/table-web",
  "version": "^0.1.0",
  "required": true,
  "schemas": [
    {
      "entity": "table",
      "name": "abrum.table.table.v1",
      "contentType": "abrum_table",
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
            "const": "abrum_table"
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
      "contentType": "abrum_table_column",
      "schema": {
        "type": "object",
        "required": [
          "type",
          "tableKey",
          "key",
          "label",
          "kind",
          "order",
          "createdAtMs",
          "updatedAtMs"
        ],
        "properties": {
          "type": {
            "const": "abrum_table_column"
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
          "kind": {
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
      "entity": "view",
      "name": "abrum.table.view.v1",
      "contentType": "abrum_table_view",
      "schema": {
        "type": "object",
        "required": [
          "type",
          "tableKey",
          "key",
          "name",
          "layout",
          "order",
          "createdAtMs",
          "updatedAtMs"
        ],
        "properties": {
          "type": {
            "const": "abrum_table_view"
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
          "name": {
            "type": "string",
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "layout": {
            "type": "string",
            "x-abrum-indexed": false,
            "x-abrum-unique": false
          },
          "config": {
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
          "entity": "view",
          "schemaName": "abrum.table.view.v1",
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
      "contentType": "abrum_table_row",
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
            "const": "abrum_table_row"
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
          "body": {
            "type": "string",
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
  "functions": [
    {
      "id": "listTables",
      "description": "List all tables in this Room with keys, row counts, columns and views.",
      "input": {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": false
      }
    },
    {
      "id": "describeTable",
      "description": "Return the full schema of one table: columns (key, label, type, config, required, order) and views (key, name, layout, config). table: Table key (e.g. \"companies\") or exact table name.",
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
      "description": "Read rows of a table. Values are returned in display units (currency as decimal numbers, relations as [{id, title}], formulas and rollups computed). view: apply a saved view's filters and sorts. search: case-insensitive text match across all columns and page content. filters: array of {column, op, value} with op eq | neq | contains | gt | gte | lt | lte | empty | notEmpty | in. sort: {column, direction: asc|desc}. limit defaults to 50 (max 500), offset for paging. includeBody: also return each row's page content. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "view": {
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
          },
          "includeBody": {
            "type": "boolean"
          }
        },
        "required": [
          "table"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "getRow",
      "description": "Read one row with all values and its page content (Markdown body). id: row id from queryRows. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "id": {
            "type": "string"
          }
        },
        "required": [
          "table",
          "id"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "createTable",
      "description": "Create a new table (database tab) with a default \"All\" table view. key is derived from name when omitted. itemName is the singular label for one row (e.g. \"Company\"). columns: array of column specs as in addColumn ({label, type, key?, config?, required?}); defaults to one Name column. Types: text | longText | number | currency | percent | rating | select | multiSelect | person | date | checkbox | url | email | phone | image | trend | relation | rollup | formula | createdTime | editedTime.",
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
      "description": "Delete a table with all its columns, views and rows. Requires confirm: true. table: Table key (e.g. \"companies\") or exact table name.",
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
      "description": "Add a column (property) to a table. Types: text | longText | number | currency | percent | rating | select | multiSelect | person | date | checkbox | url | email | phone | image | trend | relation | rollup | formula | createdTime | editedTime. config (all optional unless noted): options: [{value, label?, color?}] for select/multiSelect/person (color: gray|red|orange|amber|green|teal|blue|indigo|violet|pink); currency: ISO code like \"EUR\"; decimals: digits after the decimal point (number/currency, default 2 for currency); max: rating scale (default 5); relation: tableKey (required, the related table) and single (true = at most one linked row); rollup: relation (required, a relation column of this table), fn (count | countValues | countUnique | sum | avg | min | max | show | percentChecked | earliest | latest) and property (column of the related table, required unless fn is count); formula: expression (required, Notion-style, e.g. prop(\"Price\") * prop(\"Qty\"), if(prop(\"Due\") < today(), \"late\", \"ok\"), dateBetween(prop(\"End\"), prop(\"Start\"), \"days\")) and format (number | currency | percent | text | date | checkbox); section: form section heading; placeholder; description; aggregate: sum | avg | min | max | count | countEmpty | countNotEmpty shown in the table footer; width in pixels. position: 0-based index to insert at (default end). table: Table key (e.g. \"companies\") or exact table name.",
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
      "description": "Edit a column: label, type, config (merged into the existing config; set a key to null to remove it), required, position. Changing between stored types converts existing values where possible. column: column key or exact label. table: Table key (e.g. \"companies\") or exact table name.",
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
      "description": "Remove a column definition. Row values for it are no longer shown. column: column key or exact label. table: Table key (e.g. \"companies\") or exact table name.",
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
      "description": "Add one or more rows (max 500 per call). rows: array of objects mapping column key or label to a value in display units (currency/number as numbers, percent 0-100, date as YYYY-MM-DD, multiSelect as array, select as option value or label, relation as row ids or titles of the related table, trend as array of integers, image as https URL); formulas, rollups and times are computed and cannot be set. To also set page content use {values: {...}, body: \"Markdown\"}. Unknown select options are added automatically. table: Table key (e.g. \"companies\") or exact table name.",
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
      "description": "Update rows (max 500 per call). updates: array of {id, values?, body?} where values maps column key or label to the new value (same units as addRows; null clears a value) and body replaces the page content (Markdown). Row ids come from queryRows. table: Table key (e.g. \"companies\") or exact table name.",
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
      "description": "Delete rows by id (max 500 per call). ids: array of row ids from queryRows. table: Table key (e.g. \"companies\") or exact table name.",
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
    },
    {
      "id": "createView",
      "description": "Create a shared view of a table. layout: table | board | gallery | list. View config (all optional): filters: [{column, op, value}] with op eq | neq | contains | gt | gte | lt | lte | empty | notEmpty | in; filterMode: and | or; sorts: [{column, direction: asc | desc}]; columns: [{key, hidden?, width?}] (order and visibility); groupBy: select/person/checkbox column for boards; cover: image column for gallery/board cards; cardColumns: column keys shown on cards; wrap: true wraps cell text. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "layout": {
            "type": "string"
          },
          "config": {}
        },
        "required": [
          "table",
          "name"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "updateView",
      "description": "Change a view's name, layout, order or config (merged; null removes a key). View config (all optional): filters: [{column, op, value}] with op eq | neq | contains | gt | gte | lt | lte | empty | notEmpty | in; filterMode: and | or; sorts: [{column, direction: asc | desc}]; columns: [{key, hidden?, width?}] (order and visibility); groupBy: select/person/checkbox column for boards; cover: image column for gallery/board cards; cardColumns: column keys shown on cards; wrap: true wraps cell text. view: view key or name. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "view": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "layout": {
            "type": "string"
          },
          "config": {},
          "order": {
            "type": "integer"
          }
        },
        "required": [
          "table",
          "view"
        ],
        "additionalProperties": false
      }
    },
    {
      "id": "deleteView",
      "description": "Delete a view (a table keeps at least one). view: view key or name. table: Table key (e.g. \"companies\") or exact table name.",
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "type": "string"
          },
          "view": {
            "type": "string"
          }
        },
        "required": [
          "table",
          "view"
        ],
        "additionalProperties": false
      }
    }
  ],
  "capabilityOffers": [
    {
      "id": "abrum.table.read",
      "title": "Read tables",
      "description": "Use Table's read actions in an Agent context.",
      "functions": [
        "listTables",
        "describeTable",
        "queryRows",
        "getRow"
      ],
      "modes": [
        "on_behalf_of_caller"
      ],
      "defaultMode": "on_behalf_of_caller",
      "risk": "low",
      "resultPolicies": [
        "agent_room"
      ],
      "defaultResultPolicy": "agent_room"
    },
    {
      "id": "abrum.table.manage",
      "title": "Manage tables, columns, views and rows",
      "description": "Use Table's manage actions in an Agent context.",
      "functions": [
        "createTable",
        "updateTable",
        "deleteTable",
        "addColumn",
        "updateColumn",
        "removeColumn",
        "addRows",
        "updateRows",
        "deleteRows",
        "createView",
        "updateView",
        "deleteView"
      ],
      "modes": [
        "on_behalf_of_caller"
      ],
      "defaultMode": "on_behalf_of_caller",
      "risk": "medium",
      "resultPolicies": [
        "agent_room"
      ],
      "defaultResultPolicy": "agent_room"
    }
  ],
  "surfaces": [
    {
      "kind": "web",
      "label": "Table",
      "entrypoint": "/"
    }
  ]
};
export default abrumModule;
