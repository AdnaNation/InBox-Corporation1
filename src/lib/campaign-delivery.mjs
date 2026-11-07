// HTTP responses that do not establish whether Meta accepted a send request.
// A 408 or provider-side 5xx may happen after the request has been processed.
export function isAmbiguousMetaSendResponse(status) {
  return status === 408 || (Number.isInteger(status) && status >= 500 && status <= 599);
}
