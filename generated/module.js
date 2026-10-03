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
  "capabilityOffers": [
    {
      "id": "abrum.table.read",
      "title": "Read tables",
      "description": "Use Table's read actions in an Agent context.",
      "functions": [
        "listTables",
        "describeTable",
        "queryRows"
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
      "title": "Manage tables, columns and rows",
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
        "deleteRows"
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
