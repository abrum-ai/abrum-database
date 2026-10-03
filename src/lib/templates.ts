import type { ColumnConfig, ColumnType } from "./columns";

export type Template = {
  id: string;
  name: string;
  itemName: string;
  description: string;
  columns: Array<{ label: string; type: ColumnType; config?: ColumnConfig; required?: boolean }>;
};

const people = ["Alex Santos", "Grace Miller", "Noah Lee", "Jamie Fox", "Sarah Nguyen", "Ava Brooks"].map((name) => ({ value: name }));

export const TEMPLATES: Template[] = [
  {
    id: "companies",
    name: "Companies",
    itemName: "Company",
    description: "A sales pipeline with logo, segments, stage, owner, deal value and win probability.",
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
