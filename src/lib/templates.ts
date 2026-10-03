import type { ColumnConfig, ColumnType, RowValues } from "./columns";

export type Template = {
  id: string;
  name: string;
  itemName: string;
  description: string;
  columns: Array<{ label: string; type: ColumnType; config?: ColumnConfig; required?: boolean }>;
  /** Sample rows keyed by column label, in stored form. */
  rows?: Array<Record<string, unknown>>;
};

const people = ["Alex Santos", "Grace Miller", "Noah Lee", "Jamie Fox", "Sarah Nguyen", "Ava Brooks"].map((name) => ({ value: name }));

export const TEMPLATES: Template[] = [
  {
    id: "companies",
    name: "Companies",
    itemName: "Company",
    description: "A sales pipeline with segments, owners, deal value and win probability.",
    columns: [
      { label: "Logo", type: "image", config: { section: "Company" } },
      { label: "Company", type: "text", required: true, config: { section: "Company", placeholder: "Acme Inc." } },
      {
        label: "Segment",
        type: "multiSelect",
        config: {
          section: "Company",
          options: [
            { value: "Enterprise", color: "blue" },
            { value: "Mid-Market", color: "green" },
            { value: "SMB", color: "amber" },
            { value: "Strategic", color: "red" },
          ],
        },
      },
      {
        label: "Stage",
        type: "select",
        config: {
          section: "Company",
          options: [
            { value: "Discovery", color: "gray" },
            { value: "Pilot", color: "orange" },
            { value: "Expansion", color: "teal" },
            { value: "Renewal", color: "violet" },
          ],
        },
      },
      { label: "Account owner", type: "person", config: { section: "Ownership & deal", options: people } },
      { label: "Open deals", type: "number", config: { section: "Ownership & deal", aggregate: "sum" } },
      { label: "Pipeline value", type: "currency", config: { section: "Ownership & deal", currency: "USD", decimals: 0, aggregate: "sum" } },
      { label: "Win probability", type: "percent", config: { section: "Ownership & deal", aggregate: "avg" } },
      { label: "Activity", type: "trend", config: { section: "Last interaction" } },
      { label: "Last interaction", type: "date", config: { section: "Last interaction" } },
      { label: "Website", type: "url", config: { section: "Last interaction" } },
    ],
    rows: [
      ["Apple", ["Enterprise"], "Pilot", "Alex Santos", 6, 530111, 82, [2, 4, 1, 6, 3, 5, 7, 4, 8], "2026-03-12", "https://apple.com"],
      ["Snowflake", ["Enterprise", "Mid-Market"], "Discovery", "Grace Miller", 6, 520000, 24, [1, 3, 2, 5, 2, 4, 3, 6, 5], "2026-09-11", "https://snowflake.com"],
      ["Stripe", ["Mid-Market", "SMB"], "Expansion", "Noah Lee", 3, 442231, 44, [3, 2, 4, 1, 5, 3, 6, 4, 7], "2026-09-09", "https://stripe.com"],
      ["Attio", ["Mid-Market"], "Pilot", "Jamie Fox", 2, 420222, 38, [1, 1, 3, 2, 4, 2, 5, 3, 4], "2026-06-14", "https://attio.com"],
      ["LVMH", ["Enterprise"], "Renewal", "Sarah Nguyen", 7, 420000, 70, [4, 5, 3, 6, 5, 7, 6, 8, 9], "2026-02-21", "https://lvmh.com"],
      ["Microsoft", ["Strategic", "Enterprise"], "Expansion", "Ava Brooks", 8, 320222, 86, [5, 6, 7, 5, 8, 7, 9, 8, 10], "2026-03-15", "https://microsoft.com"],
    ].map(([company, segment, stage, owner, deals, value, probability, activity, last, website]) => ({
      Company: company,
      Segment: segment,
      Stage: stage,
      "Account owner": owner,
      "Open deals": deals,
      "Pipeline value": value,
      "Win probability": probability,
      Activity: activity,
      "Last interaction": last,
      Website: website,
    })),
  },
  {
    id: "contacts",
    name: "Contacts",
    itemName: "Contact",
    description: "People with photo, role, email, phone and a rating.",
    columns: [
      { label: "Photo", type: "image" },
      { label: "Name", type: "text", required: true },
      { label: "Role", type: "text" },
      { label: "Email", type: "email" },
      { label: "Phone", type: "phone" },
      { label: "Rating", type: "rating", config: { max: 5 } },
      { label: "Notes", type: "longText" },
    ],
  },
  {
    id: "blank",
    name: "Table",
    itemName: "Item",
    description: "Start with a single name column and add what you need.",
    columns: [{ label: "Name", type: "text", required: true }],
  },
];

/** Map label-keyed sample values to the generated column keys. */
export function templateRows(template: Template, columnKeys: string[]): RowValues[] {
  const keyByLabel = new Map(template.columns.map((column, index) => [column.label, columnKeys[index]]));
  return (template.rows ?? []).map((row) => {
    const values: RowValues = {};
    for (const [label, value] of Object.entries(row)) {
      const key = keyByLabel.get(label);
      if (key) values[key] = value;
    }
    return values;
  });
}
