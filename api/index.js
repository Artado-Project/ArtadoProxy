export default function handler(_req, res) {
   res.statusCode = 404;
   res.setHeader('content-type', 'application/json; charset=utf-8');
   res.end(JSON.stringify({ error: 'not found' }));
 }
