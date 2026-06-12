const axios = require('axios');
axios.get('http://localhost:5000/api/health/db')
  .then(res => console.log(JSON.stringify(res.data, null, 2)))
  .catch(err => console.error(JSON.stringify(err.response.data, null, 2)));
