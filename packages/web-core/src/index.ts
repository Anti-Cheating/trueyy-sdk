export { TrueyyClient, type TrueyyClientOptions } from "./client.js";
export { WsClient, type WsClientOptions } from "./wsClient.js";
export {
  detectHelper,
  helperJoin,
  helperJoinedMeeting,
  helperLeave,
  helperStatus,
  HELPER_DOWNLOAD_URL_MAC,
  HELPER_DOWNLOAD_URL_WIN,
  type HelperStatus,
} from "./helperBridge.js";
export { consentApi, TrueyyConsentError, type ConsentText } from "./consent.js";
export type {
  SessionRole,
  SessionStatus,
  RiskPulseEvent,
  WindowResultEvent,
  LiveTranscriptEvent,
  CandidateStatusEvent,
  ImageAnalysisResultEvent,
  ConsentStatusEvent,
  SocketEventName,
  SocketEventMap,
} from "./types.js";
