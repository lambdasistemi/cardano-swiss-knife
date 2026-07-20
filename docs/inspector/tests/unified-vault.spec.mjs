import { expect, test } from "@playwright/test";
import { webcrypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const passphrase = "correct horse battery staple";
const mnemonic =
  "message mask aunt wheel ten maze between tomato slow analyst ladder such report capital produce";
const blockfrostSecret = "mainnet_vault_only_project_id";
const koiosSecret = "vault-only-koios-bearer-token";

const signingFixtures = {
  "message-sign-root-text":
    "root_xsk1qz497hekfxq0ftrzjh7sl0m9vseep44mrnmk2dkzawczwy7ghfgd3ypmaem5k7lcv782p4haa4kcwmdnks4776rkgrx9zn4h8am82dagca203x7fejp4x04ty47he9rztj2lp46fwyzz3ad2yszwadjfnv76n80u",
  "message-sign-account-text":
    "acct_xsk1hqepflw2je7xfszvp0x9ejcqhv54k74x3xmvkjku0al2gxwghfgdnqdd2mt2ewwlwlpufza4edz4n9725dy6mz0wr4jr7yxjp08y4qqa9v8x23ky4nh64vrlk0qnzuq3kj5argx3ek4fgcfaydlyuw4945grn2cs",
  "message-sign-address-hex":
    "addr_xsk1wzrez8tt80xnnll3q0p70edlhnu04nu8xhrdtnpucd3z5g7ghfgp7tlqlu73esn25ck83z2maj0zv0ktwfas3un27jm02dggqeg3hlf64eevsq9704sluy8qha0gnjkj2y75aes93u7gd9ew87vjpefjfsfhd84l",
  "message-sign-stake-text":
    "stake_xsk1fzzzcr77sw274y4xs8c3ltwaap8k6qd49rrt8rqdhu7vufwghfggsh7d94t055xycxhm4x68wwprsqj8gdggtymf9xlh38z8qxu8f4gmexswjjcthk4dj0ks50ll25he5k67smgc8trzlerg7wg49fq6nucydyhw",
};
const signingKey = (label) => {
  const fixture = signingFixtures[label];
  if (!fixture) throw new Error(`Missing signing fixture: ${label}`);
  return fixture;
};

const vaultEntries = [
  { id: "mnemonic-entry", kind: "mnemonic", label: "Restore phrase", value: mnemonic },
  {
    id: "signing-entry",
    kind: "signing-key",
    label: "Explicit signing key",
    value: signingKey("message-sign-address-hex"),
  },
  {
    id: "root-entry",
    kind: "root-private-key",
    label: "Root private key",
    value: signingKey("message-sign-root-text"),
  },
  {
    id: "account-entry",
    kind: "account-private-key",
    label: "Account private key",
    value: signingKey("message-sign-account-text"),
  },
  {
    id: "address-entry",
    kind: "address-private-key",
    label: "Address private key",
    value: signingKey("message-sign-address-hex"),
  },
  {
    id: "stake-entry",
    kind: "stake-private-key",
    label: "Stake private key",
    value: signingKey("message-sign-stake-text"),
  },
  {
    id: "blockfrost-entry",
    kind: "blockfrost-project-id",
    label: "Blockfrost project ID",
    value: blockfrostSecret,
  },
  {
    id: "koios-entry",
    kind: "koios-bearer-token",
    label: "Koios bearer token",
    value: koiosSecret,
  },
].map((entry, index) => ({
  ...entry,
  createdAt: `2026-07-15T12:00:0${index}.000Z`,
}));

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const unsupportedAge = "YWdlLWVuY3J5cHRpb24ub3JnL3YxCi0+IHNjcnlwdCBlamsvd1NCZjZFaTA0K2pUVzlNNUtnIDE4Cm95UzhINm1tU09UcWJPTTE3MDh2b3RsVHpTT3R2WjhHUW05Qk1pZk93bUkKLS0tIEFXVWI0bnRYQWRtMS9yd2dQdUR5Y1lkVkZCb3lFMjlRcDlCZ05oNUFZTkEKQFXVjUDIYumyfIVhapxWiRLmXiee//mSB94zvWcnO+JduQlK72ahcbcxdX1GNpv9aJfE82k3DqrAPF8cwEhVE/HgVi1OLcVbI3kkslroEta/OOfs0Q==";
const duplicateAge = "YWdlLWVuY3J5cHRpb24ub3JnL3YxCi0+IHNjcnlwdCBBYXNmRG54blRZdG54TEVMaUNDU0ZnIDE4CmFiUUdsMzZ1YjE4N3cvRFNLVGYrZEd6bXNYMmxCRTZ2UW5RRTFCa2Q3NlkKLS0tIFVyMTB0bUsyRUlVeC9Fbk5WRzFBeTVEZVRJczlONFVIR1VZSFJmem40ZjAKcT4l80As6QGuxgUk836Y/4SMIGxKRYhecms9h29uefycVEvDCjL36MlFhxnNbq2GJn2f4YDaWnwWxHXRGWdavi90d0PGmyL+4AxGvyuMLRTHj8g5G4Cbxj9KWmJ4VRDkCAgBleLIm431n90aJMdUGfXOdtnLHol1+7ZQw51AHGeK//VBShIGMdcvWOzGP8FSJGH47+KKpnTAUeYBSdwG804NPd5mpVzKbkoGsvpcsrwfQ1d03I1D5eU1EhI/he4T9+RsFKAaDdwwpKumTBMFyum+TLquAOBlhW1IaqCZW4KXT6J6sHnJQIKdxdvhcgd5LKh0tf/bASV6NXQUttBvThTya66C2faMHRoK6RbAqVnnSQV0jOdtxw==";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { globalThis.__CSK_VAULT_TEST_SEAM__ = true; });
});

async function deriveVaultKey(secret, salt, usages) {
  const material = await webcrypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return webcrypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 250000 },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

function base64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function legacyVaultDocument(entries, secret = passphrase) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(secret, salt, ["encrypt"]);
  const plaintext = encoder.encode(JSON.stringify({ version: 1, entries }));
  const ciphertext = new Uint8Array(
    await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  return JSON.stringify({
    version: 1,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 250000,
      saltBase64: base64(salt),
    },
    cipher: {
      name: "AES-GCM",
      ivBase64: base64(iv),
      ciphertextBase64: base64(ciphertext),
    },
  });
}

async function canonicalVaultDocument(page, entries, secret = passphrase, version = 1) {
  const bytes = await page.evaluate(async ({ entries: fixtureEntries, fixturePassphrase, fixtureVersion }) =>
    Array.from(await globalThis.__cskVaultTestCore.encryptVault(fixturePassphrase, {
      cardanoSwissKnifeVault: { version: fixtureVersion, entries: fixtureEntries },
    })),
  { entries, fixturePassphrase: secret, fixtureVersion: version });
  return Uint8Array.from(bytes);
}

async function decryptCanonicalVault(page, bytes, secret = passphrase) {
  return page.evaluate(async ({ encrypted, fixturePassphrase }) =>
    globalThis.__cskVaultTestCore.decryptVault(fixturePassphrase, Uint8Array.from(encrypted)),
  { encrypted: Array.from(bytes), fixturePassphrase: secret });
}

async function openVaultWithChooser(page, documentText, secret = passphrase) {
  await page.getByLabel("Vault passphrase").fill(secret);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open vault" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "portable.vault.age",
    mimeType: "application/vnd.cardano-swiss-knife.vault+age",
    buffer: Buffer.from(documentText),
  });
}

async function migrateLegacyWithChooser(page, documentText, secret = passphrase) {
  await page.getByLabel("Vault passphrase").fill(secret);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Migrate legacy vault" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "legacy-v1.vault.json",
    mimeType: "application/json",
    buffer: Buffer.from(documentText),
  });
}

function entryCard(page, label) {
  return page.locator(".vault-entry").filter({ hasText: label });
}

async function storageSnapshot(page) {
  return page.evaluate(async () => {
    const local = Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter(Boolean)
        .map((key) => [key, localStorage.getItem(key)]),
    );
    const session = Object.fromEntries(
      Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
        .filter(Boolean)
        .map((key) => [key, sessionStorage.getItem(key)]),
    );
    const indexed = {};
    if (typeof indexedDB.databases === "function") {
      for (const info of await indexedDB.databases()) {
        if (!info.name) continue;
        indexed[info.name] = await new Promise((resolve, reject) => {
          const request = indexedDB.open(info.name);
          request.onerror = () => reject(request.error);
          request.onsuccess = async () => {
            const database = request.result;
            const values = {};
            try {
              for (const storeName of database.objectStoreNames) {
                values[storeName] = await new Promise((storeResolve, storeReject) => {
                  const transaction = database.transaction(storeName, "readonly");
                  const getAll = transaction.objectStore(storeName).getAll();
                  getAll.onerror = () => storeReject(getAll.error);
                  getAll.onsuccess = () => storeResolve(getAll.result);
                });
              }
              resolve(values);
            } finally {
              database.close();
            }
          };
        });
      }
    }
    return { local, session, cookies: document.cookie, indexed };
  });
}

test("vault direct entry creates canonical age files and exposes legacy migration separately", async ({
  page,
}, testInfo) => {
  await page.goto("/vault");

  await expect(page).toHaveURL(/\/vault\/?$/);
  await expect(page.getByRole("heading", { name: "Vault", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Primary" });
  expect(await navigation.getByRole("link").allTextContents()).toEqual([
    "Workbench",
    "Addresses",
    "Keys",
    "Scripts",
    "Vault",
    "Library",
    "Docs",
    "Settings",
  ]);

  await page.getByLabel("Vault passphrase").fill(passphrase);
  const createDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Create vault" }).click();
  const createdDownload = await createDownloadPromise;
  expect(createdDownload.suggestedFilename()).toBe("cardano-swiss-knife.vault.age");
  const createdPath = await createdDownload.path();
  expect(createdPath).not.toBeNull();
  expect(await decryptCanonicalVault(page, await readFile(createdPath))).toEqual({ cardanoSwissKnifeVault: { version: 1, entries: [] } });
  await expect(page.locator(".vault-summary")).toContainText("Unlocked");
  await expect(page.getByRole("button", { name: "Migrate legacy vault" })).toBeVisible();

  await page.getByRole("button", { name: "Lock vault" }).click();
  await expect(page.locator(".vault-summary")).toContainText("Locked");

  const legacyDocument = await legacyVaultDocument(vaultEntries);
  await openVaultWithChooser(page, legacyDocument);
  await expect(page.getByRole("alert")).toContainText("Vault format is invalid.");
  await expect(page.locator(".vault-summary")).toContainText("Locked");
  await migrateLegacyWithChooser(page, legacyDocument);
  await expect(page.locator(".vault-summary")).toContainText("Unlocked");
  await expect(page.locator(".vault-entry")).toHaveCount(vaultEntries.length);
  for (const entry of vaultEntries) {
    await expect(entryCard(page, entry.label)).toContainText(entry.kind);
    await expect(page.getByText(entry.value, { exact: true })).toHaveCount(0);
  }

  const exportDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const exportedDownload = await exportDownloadPromise;
  const exportedPath = await exportedDownload.path();
  expect(exportedPath).not.toBeNull();
  const exportedBytes = await readFile(exportedPath);
  expect(exportedDownload.suggestedFilename()).toBe("cardano-swiss-knife.vault.age");

  const stableExport = testInfo.outputPath("round-trip-vault.age");
  await writeFile(stableExport, exportedBytes);
  await page.getByRole("button", { name: "Lock vault" }).click();
  await page.getByLabel("Vault passphrase").fill(passphrase);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open vault" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(stableExport);
  await expect(page.locator(".vault-entry")).toHaveCount(vaultEntries.length);
});

test("vault shelves filter compatible kinds and support peek and pop without clipboard transfer", async ({
  page,
}) => {
  await page.goto("/vault");
  await migrateLegacyWithChooser(page, await legacyVaultDocument(vaultEntries));

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Keys" }).click();
  await page.getByRole("tab", { name: "Restore", exact: true }).click();
  const restoreShelf = page.locator(".vault-shelf--restore");
  await expect(restoreShelf.locator("strong", { hasText: "Restore phrase" })).toHaveCount(1);
  await expect(restoreShelf.getByText("Explicit signing key", { exact: true })).toHaveCount(0);
  await restoreShelf.getByRole("button", { name: "Peek" }).click();
  await expect(page.getByLabel("Recovery phrase")).toHaveValue(mnemonic);
  await expect(restoreShelf.locator("strong", { hasText: "Restore phrase" })).toHaveCount(1);

  await page.getByRole("tab", { name: "Sign & verify", exact: true }).click();
  const signingShelf = page.locator(".vault-shelf--signing");
  for (const label of [
    "Explicit signing key",
    "Root private key",
    "Account private key",
    "Address private key",
    "Stake private key",
  ]) {
    await expect(signingShelf.locator("strong", { hasText: label })).toHaveCount(1);
  }
  await expect(signingShelf.getByText("Restore phrase", { exact: true })).toHaveCount(0);
  await expect(signingShelf.getByText("Blockfrost project ID", { exact: true })).toHaveCount(0);
  const signingDownloadPromise = page.waitForEvent("download");
  await entryCard(page, "Explicit signing key").getByRole("button", { name: "Pop" }).click();
  await signingDownloadPromise;
  await expect(page.getByLabel("Signing key")).toHaveValue(signingKey("message-sign-address-hex"));
  await expect(signingShelf.getByText("Explicit signing key", { exact: true })).toHaveCount(0);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Settings" }).click();
  const providerShelf = page.locator(".vault-shelf--provider");
  await expect(providerShelf.locator("strong", { hasText: "Blockfrost project ID" })).toHaveCount(1);
  await expect(providerShelf.getByText("Koios bearer token", { exact: true })).toHaveCount(0);
  await providerShelf.getByRole("button", { name: "Peek" }).click();
  await expect(page.getByLabel("Blockfrost project ID")).toHaveValue(blockfrostSecret);
  await page.getByRole("radio", { name: "Koios" }).check();
  await expect(providerShelf.locator("strong", { hasText: "Koios bearer token" })).toHaveCount(1);
  await expect(providerShelf.getByText("Blockfrost project ID", { exact: true })).toHaveCount(0);
});

test("vault preserves opaque entries and rejects failed age imports without mutating the current shelf", async ({
  page,
}) => {
  const opaque = {
    id: "future-entry",
    kind: "future-secret-kind",
    label: "Future secret",
    value: "opaque-future-secret",
    createdAt: "2026-07-15T12:00:09.000Z",
    future: { nested: ["retain", 42] },
  };
  const sourceEntries = [...vaultEntries, opaque];

  await page.goto("/vault");
  await openVaultWithChooser(page, await canonicalVaultDocument(page, sourceEntries));
  await expect(page.locator(".vault-entry")).toHaveCount(sourceEntries.length);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Keys" }).click();
  await page.getByRole("tab", { name: "Sign & verify", exact: true }).click();
  await page.getByRole("button", { name: "Show signing key" }).click();
  await page.getByLabel("Signing key").fill(signingKey("message-sign-address-hex"));
  await page.getByLabel("Vault item name").fill("Known mutation");
  const saveDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save signing key to vault" }).click();
  const saved = await saveDownloadPromise;
  const savedPath = await saved.path();
  expect(savedPath).not.toBeNull();
  expect((await decryptCanonicalVault(page, await readFile(savedPath))).cardanoSwissKnifeVault.entries.find((entry) => entry.id === opaque.id)).toEqual(opaque);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Vault" }).click();
  await page.getByRole("button", { name: "Lock vault" }).click();
  await openVaultWithChooser(page, await readFile(savedPath));
  await expect(entryCard(page, opaque.label)).toContainText(opaque.kind);
  const unchangedLabels = await page.locator(".vault-entry strong").allTextContents();
  const failedImports = [
    { name: "malformed.age", bytes: Buffer.from("not an age file"), category: "Vault format is invalid." },
    { name: "unsupported.age", bytes: Buffer.from(unsupportedAge, "base64"), category: "Vault version is unsupported." },
    { name: "duplicate.age", bytes: Buffer.from(duplicateAge, "base64"), category: "Vault identity is ambiguous." },
  ];
  for (const failed of failedImports) {
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open vault" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: failed.name,
      mimeType: "application/vnd.cardano-swiss-knife.vault+age",
      buffer: Buffer.from(failed.bytes),
    });
    await expect(page.getByRole("alert")).toContainText(failed.category);
    expect(await page.locator(".vault-entry strong").allTextContents()).toEqual(unchangedLabels);
  }
});

test("initialization deletes legacy credentials and secret workflows leave browser storage clear", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const legacy = {
      blockfrost_project_id: "legacy-blockfrost-secret",
      koios_bearer_token: "legacy-koios-secret",
      persist_api_keys: "true",
    };
    for (const [key, value] of Object.entries(legacy)) localStorage.setItem(key, value);
    globalThis.__legacyStorageCalls = [];
    const prototype = Object.getPrototypeOf(localStorage);
    for (const method of ["getItem", "setItem", "removeItem"]) {
      const original = prototype[method];
      prototype[method] = function (...args) {
        if (Object.hasOwn(legacy, args[0])) {
          globalThis.__legacyStorageCalls.push({ method, key: args[0] });
        }
        return original.apply(this, args);
      };
    }
  });

  await page.goto("/vault");
  expect(
    await page.evaluate(() => ({
      values: {
        blockfrost: localStorage.getItem("blockfrost_project_id"),
        koios: localStorage.getItem("koios_bearer_token"),
        persist: localStorage.getItem("persist_api_keys"),
      },
      calls: globalThis.__legacyStorageCalls,
    })),
  ).toEqual({
    values: { blockfrost: null, koios: null, persist: null },
    calls: [
      { method: "removeItem", key: "blockfrost_project_id" },
      { method: "removeItem", key: "koios_bearer_token" },
      { method: "removeItem", key: "persist_api_keys" },
      { method: "getItem", key: "blockfrost_project_id" },
      { method: "getItem", key: "koios_bearer_token" },
      { method: "getItem", key: "persist_api_keys" },
    ],
  });

  await migrateLegacyWithChooser(page, await legacyVaultDocument(vaultEntries));
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Koios" }).check();
  await page.getByRole("radio", { name: "preview" }).check();
  await page.locator(".vault-shelf--provider").getByRole("button", { name: "Peek" }).click();
  await page.getByRole("button", { name: "Toggle theme" }).click();

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Keys" }).click();
  await page.getByRole("tab", { name: "Restore", exact: true }).click();
  await page.locator(".vault-shelf--restore").getByRole("button", { name: "Peek" }).click();
  await page.getByRole("tab", { name: "Sign & verify", exact: true }).click();
  await entryCard(page, "Address private key").getByRole("button", { name: "Peek" }).click();

  const forbidden = [
    ...vaultEntries.flatMap((entry) => [entry.label, entry.value]),
    "legacy-blockfrost-secret",
    "legacy-koios-secret",
  ];
  const beforeReload = JSON.stringify(await storageSnapshot(page));
  for (const value of forbidden) expect(beforeReload).not.toContain(value);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Keys", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Sign & verify", exact: true }).click();
  await expect(page.getByLabel("Signing key")).toHaveValue("");
  await expect(page.locator(".vault-entry")).toHaveCount(0);
  const afterReload = JSON.stringify(await storageSnapshot(page));
  for (const value of forbidden) expect(afterReload).not.toContain(value);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("radio", { name: "Koios" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "preview" })).toBeChecked();
  await expect(page.getByLabel("Koios bearer token")).toHaveValue("");
});

test("vault refuses locked saves and reports wrong passphrase, invalid document, and write failures without leaks", async ({
  page,
}) => {
  await page.goto("/keys");
  await page.getByRole("tab", { name: "Sign & verify", exact: true }).click();
  await page.getByRole("button", { name: "Show signing key" }).click();
  await page.getByLabel("Signing key").fill(signingKey("message-sign-address-hex"));
  await page.getByRole("button", { name: "Save signing key to vault" }).click();
  await expect(page.getByRole("alert")).toContainText("Open or create a vault before saving secrets");

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Vault" }).click();
  const encrypted = await canonicalVaultDocument(page, vaultEntries);
  await openVaultWithChooser(page, encrypted, "wrong passphrase");
  await expect(page.getByRole("alert")).toContainText("Vault unlock failed.");
  await expect(page.locator("body")).not.toContainText(mnemonic);

  await page.getByLabel("Vault passphrase").fill(passphrase);
  const invalidChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open vault" }).click();
  const invalidChooser = await invalidChooserPromise;
  await invalidChooser.setFiles({
    name: "invalid-vault.age",
    mimeType: "application/vnd.cardano-swiss-knife.vault+age",
    buffer: Buffer.from(JSON.stringify({ secret: koiosSecret })),
  });
  await expect(page.getByRole("alert")).toContainText("Vault format is invalid.");
  await expect(page.getByRole("alert")).not.toContainText(koiosSecret);

  await migrateLegacyWithChooser(page, await legacyVaultDocument(vaultEntries));
  const backupPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const backup = await backupPromise;
  const backupPath = await backup.path();
  expect(backupPath).not.toBeNull();
  const canonicalBytes = await readFile(backupPath);

  await page.reload();
  await page.evaluate((documentBytes) => {
    window.showOpenFilePicker = async () => [
      {
        name: "write-failure.vault.age",
        getFile: async () => new File([new Uint8Array(documentBytes)], "write-failure.vault.age", { type: "application/vnd.cardano-swiss-knife.vault+age" }),
        createWritable: async () => {
          throw new Error("simulated disk full");
        },
      },
    ];
  }, Array.from(canonicalBytes));
  await page.getByLabel("Vault passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Open vault" }).click();
  await expect(page.locator(".vault-summary")).toContainText("Unlocked");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Blockfrost project ID").fill("write-failure-secret");
  await page.getByLabel("Vault item name").fill("Failure probe");
  await page.getByRole("button", { name: "Save secret to vault" }).click();
  await expect(page.getByRole("alert")).toContainText("Vault write failed.");
  await expect(page.getByRole("alert")).not.toContainText("write-failure-secret");
});
