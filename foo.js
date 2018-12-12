const fetch = require('node-fetch');
const http = require('http');

fetch('http://jsonplaceholder.typicode.com/todos/5')
  .then(response => response.json())
  .then(json => console.log(json))
