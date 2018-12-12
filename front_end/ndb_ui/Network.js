Ndb.Network = class Network {
  static __init() {
    return new Network();
  }

  sendData(method, data) {
    // @khang: this is hacky code
    window._networkDispatcher[method](
      "E6BFAE0AFFF1A393ED57B66729D69411",
      "E6BFAE0AFFF1A393ED57B66729D69411",
      "http://jsonplaceholder.typicode.com/todos/1",
      {
        "url": "http://jsonplaceholder.typicode.com/todos/1",
        "method": "GET",
        "headers": {
          "Upgrade-Insecure-Requests": "1",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3634.0 Safari/537.36"
        },
        "mixedContentType": "none",
        "initialPriority": "VeryHigh",
        "referrerPolicy": "no-referrer-when-downgrade"
      },
      341143.242095,
      1544306456.209423,
      {},
      "",
      "XHR"
    )
  }
}
