window.dataLayer = window.dataLayer || [];
function gtag(){
  dataLayer.push(arguments);
  try {
    if (arguments[0] === 'event' && typeof arguments[1] === 'string') {
      var eventName = arguments[1];
      var eventParams = arguments[2] || {};
      if (window.MedLadderAndroidApp && typeof window.MedLadderAndroidApp.logEvent === 'function') {
        window.MedLadderAndroidApp.logEvent(eventName, JSON.stringify(eventParams));
      }
    }
  } catch (_) {}
}
gtag('js', new Date());
gtag('config', 'G-P5VJLV9KRH');
