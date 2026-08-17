import { classifyOriginProbe } from "./probe-admission.ts";

function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`INT-GH-PROBE ${message}`);
}

function publicAnonymousAdmission(): void {
  ok(
    classifyOriginProbe({ reachable: true, authenticated: false, refused: false, publiclyReadable: true }) === "REACHABLE",
    "an explicitly public readable origin was not admitted",
  );
}

function reachabilityDoesNotImplyPublicReadability(): void {
  ok(
    classifyOriginProbe({ reachable: true, authenticated: false, refused: false }) === "AUTH_ABSENT",
    "reachability alone was treated as public readability",
  );
}

function refusalAndAbsenceStayDistinct(): void {
  ok(
    classifyOriginProbe({ reachable: false, authenticated: false, refused: false }) === "ORIGIN_ABSENT",
    "an unreachable origin was not reported as absent",
  );
  ok(
    classifyOriginProbe({ reachable: true, authenticated: true, refused: true }) === "AUTH_REFUSED",
    "an authorization refusal was not reported as refused",
  );
}

function authenticatedPrivateAdmission(): void {
  ok(
    classifyOriginProbe({ reachable: true, authenticated: true, refused: false }) === "REACHABLE",
    "authenticated private-origin access was not admitted",
  );
}

publicAnonymousAdmission();
reachabilityDoesNotImplyPublicReadability();
refusalAndAbsenceStayDistinct();
authenticatedPrivateAdmission();
console.log("INT-GH-PROBE GREEN: public anonymous admission, reachability disagreement, refusal/absence separation, private authentication");
