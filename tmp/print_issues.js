const fs = require('fs');
const d = fs.readFileSync('tmp/gh_issues.json', 'utf8');
const j = JSON.parse(d);
j.forEach(i => console.log(i.number + ': ' + i.title));
