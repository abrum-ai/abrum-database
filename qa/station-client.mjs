// Minimal signed Station client for live integration tests. Signs requests
// exactly like the ABRUM CLI; needs a monorepo checkout for the protocol code.
import { randomBytes } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function stationClient({ url, phrase, abrumRepo }) {
  const protocol = await import(pathToFileURL(path.join(abrumRepo, "packages/abrum-cli/src/protocol.js")).href);
  const identity = protocol.identityFromRecoveryPhrase(phrase);
  const did = identity.did;

  function headers(method, routeScope, bodyText) {
    const timestampMs = Date.now();
    const nonce = `nonce-${randomBytes(8).toString("hex")}`;
    const payload = protocol.actorHttpSignaturePayload(method, routeScope, did, timestampMs, nonce, bodyText);
    return {
      "x-abrum-actor-principal-did": did,
      "x-abrum-request-timestamp-ms": String(timestampMs),
      "x-abrum-request-nonce": nonce,
      "x-abrum-request-signature": protocol.signUtf8(identity, payload),
    };
  }

  async function parse(response) {
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 2000)}`);
    return text ? JSON.parse(text) : null;
  }

  async function post(route, body) {
    const bodyText = JSON.stringify(protocol.withoutSignedActorBodyFields({ ...body, actor_principal_did: did }));
    return parse(await fetch(`${url}${route}`, { method: "POST", headers: { "content-type": "application/json", ...headers("POST", route, bodyText) }, body: bodyText }));
  }

  async function get(route) {
    const scope = route.split("?")[0];
    const separator = route.includes("?") ? "&" : "?";
    const full = `${route}${separator}actor_principal_did=${encodeURIComponent(did)}`;
    return parse(await fetch(`${url}${full}`, { headers: headers("GET", scope, "") }));
  }

  return { did, post, get };
}
