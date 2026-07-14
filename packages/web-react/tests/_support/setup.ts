import "global-jsdom/register";
// React 19 act() environment flag — silences act warnings + enables flushing.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
