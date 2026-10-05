export declare const abrumModule: {
  readonly appId: "abrum.database";
  readonly package: "@abrum/database-web";
  readonly version: "^0.1.0";
  readonly __abrumModule: true;
  readonly required: true;
  readonly capabilities?: readonly string[];
  readonly schemas: ReadonlyArray<{ readonly entity: string; readonly name: string; readonly contentType?: string; readonly schema?: unknown }>;
  readonly functions: ReadonlyArray<{ readonly id?: string; readonly name?: string; readonly input?: unknown; readonly output?: unknown; readonly [key: string]: unknown }>;
  readonly capabilityOffers?: ReadonlyArray<{ readonly id: string; readonly title: string; readonly functions: readonly string[]; readonly modes?: readonly string[]; readonly defaultMode?: string; readonly risk?: string; readonly resultPolicies?: readonly string[]; readonly defaultResultPolicy?: string; readonly [key: string]: unknown }>;
  readonly surfaces: ReadonlyArray<{ readonly id?: string; readonly kind: string; readonly label?: string; readonly entrypoint?: string; readonly placements?: readonly string[]; readonly input?: unknown; readonly [key: string]: unknown }>;
};
export default abrumModule;
