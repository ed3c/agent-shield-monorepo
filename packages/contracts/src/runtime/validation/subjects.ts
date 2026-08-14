import type {
  RuntimeEnvironmentSubject,
  RuntimeEnvironmentSubjectKind,
  RuntimeImmutableSubject,
  RuntimeProviderDescriptor,
  RuntimeProviderSubject,
  RuntimeProviderSubjectKind,
  RuntimeSourceRef,
} from "../types.ts";
import {
  GIT_OID,
  SAFE_ID,
  SAFE_MEDIA,
  SAFE_VERSION,
  SHA_256,
  boundedStringArray,
  enumValue,
  exactKeys,
  fail,
  portableRepository,
  record,
  requiredString,
} from "./common.ts";

export function validateSource(value: unknown): RuntimeSourceRef {
  const source = record(value, "source");
  const kind = enumValue(source.kind, "source.kind", ["git", "artifact"] as const);
  if (kind === "git") {
    exactKeys(source, ["kind", "repository", "commit", "tree"], "source");
    const repository = requiredString(source.repository, "source.repository", undefined, 512);
    portableRepository(repository, "source.repository");
    return {
      kind,
      repository,
      commit: requiredString(source.commit, "source.commit", GIT_OID, 40),
      tree: requiredString(source.tree, "source.tree", GIT_OID, 40),
    };
  }
  exactKeys(source, ["kind", "sha256", "mediaType"], "source");
  return {
    kind,
    sha256: requiredString(source.sha256, "source.sha256", SHA_256, 64),
    mediaType: requiredString(source.mediaType, "source.mediaType", SAFE_MEDIA, 255),
  };
}

function validateSubject<K extends string>(
  value: unknown,
  name: string,
  kinds: readonly K[],
): RuntimeImmutableSubject<K> {
  const subject = record(value, name);
  exactKeys(subject, ["kind", "id", "version", "sha256"], name);
  return {
    kind: enumValue(subject.kind, `${name}.kind`, kinds),
    id: requiredString(subject.id, `${name}.id`, SAFE_ID, 128),
    version: requiredString(subject.version, `${name}.version`, SAFE_VERSION, 64),
    sha256: requiredString(subject.sha256, `${name}.sha256`, SHA_256, 64),
  };
}

export function validateRuntimeProviderSubject(value: unknown, name = "providerSubject"): RuntimeProviderSubject {
  return validateSubject(value, name, ["source", "artifact", "binary"] as const satisfies readonly RuntimeProviderSubjectKind[]);
}

export function validateRuntimeEnvironmentSubject(value: unknown, name = "environmentSubject"): RuntimeEnvironmentSubject {
  return validateSubject(value, name, ["image", "template", "profile"] as const satisfies readonly RuntimeEnvironmentSubjectKind[]);
}

export function validateRuntimeProviderDescriptor(value: unknown): RuntimeProviderDescriptor {
  const descriptor = record(value, "providerDescriptor");
  exactKeys(
    descriptor,
    [
      "id",
      "version",
      "subject",
      "environmentSubject",
      "scope",
      "capabilities",
      "credentialBoundary",
      "implementation",
      "availability",
      "liveEvidence",
    ],
    "providerDescriptor",
  );
  const capabilities = boundedStringArray(descriptor.capabilities, "providerDescriptor.capabilities", 64, (entry, index) => {
    if (!SAFE_ID.test(entry)) fail(`providerDescriptor.capabilities[${index}] is invalid`);
  });
  if (capabilities.length === 0) fail("providerDescriptor.capabilities must not be empty");
  capabilities.sort();
  const id = requiredString(descriptor.id, "providerDescriptor.id", SAFE_ID, 128);
  const version = requiredString(descriptor.version, "providerDescriptor.version", SAFE_VERSION, 64);
  const subject = validateRuntimeProviderSubject(descriptor.subject, "providerDescriptor.subject");
  const environmentSubject = validateRuntimeEnvironmentSubject(
    descriptor.environmentSubject,
    "providerDescriptor.environmentSubject",
  );
  if (subject.id !== id || subject.version !== version) {
    fail("providerDescriptor subject must bind the descriptor id and version");
  }

  const result: RuntimeProviderDescriptor = {
    id,
    version,
    subject,
    environmentSubject,
    scope: enumValue(descriptor.scope, "providerDescriptor.scope", ["local", "cloud"] as const),
    capabilities,
    credentialBoundary: enumValue(
      descriptor.credentialBoundary,
      "providerDescriptor.credentialBoundary",
      ["none", "host-only", "broker-only"] as const,
    ),
    implementation: enumValue(
      descriptor.implementation,
      "providerDescriptor.implementation",
      ["IMPLEMENTED", "NOT_IMPLEMENTED"] as const,
    ),
    availability: enumValue(
      descriptor.availability,
      "providerDescriptor.availability",
      ["AVAILABLE", "ABSENT", "REFUSED_POLICY"] as const,
    ),
    liveEvidence: enumValue(descriptor.liveEvidence, "providerDescriptor.liveEvidence", ["PASS", "FAIL", "NOT_EXERCISED"] as const),
  };

  if (result.implementation === "NOT_IMPLEMENTED" && result.liveEvidence !== "NOT_EXERCISED") {
    fail("providerDescriptor NOT_IMPLEMENTED state cannot have live evidence");
  }
  if (result.availability !== "AVAILABLE" && result.liveEvidence === "PASS") {
    fail("providerDescriptor unavailable provider cannot have PASS live evidence");
  }
  return result;
}

