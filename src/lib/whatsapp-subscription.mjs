/**
 * Return whether Meta reports that the expected app is subscribed to a WABA.
 * Graph API responses normally nest the app ID under
 * whatsapp_business_api_data.id; accept the legacy top-level id as well.
 */
export function isMetaAppSubscribed(subscriptionResponse, appId) {
  if (!appId || !Array.isArray(subscriptionResponse?.data)) return false;
  return subscriptionResponse.data.some((item) => {
    const subscribedAppId = item?.whatsapp_business_api_data?.id ?? item?.id;
    return subscribedAppId != null && String(subscribedAppId) === String(appId);
  });
}
