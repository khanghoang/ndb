const fetch = require('node-fetch');

fetch('http://jsonplaceholder.typicode.com/todos/5');

fetch('https://developers.video.ibm.com/images/example-channel-nasa.jpg')

fetch('https://jsonplaceholder.typicode.com/posts', {
  method: 'POST',
  body: JSON.stringify({
    title: 'foo',
    body: 'bar',
    userId: 1
  }),
  headers: {
    'Content-type': 'application/json; charset=UTF-8'
  }
})
.then(response => response.json())
.then(json => console.log(json))
