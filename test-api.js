fetch("http://localhost:3000/api/og-image?url=https://www.aljazeera.com/news/2026/8/25/spain-requests-emergency-funding-from-the-eu-over-ceuta-migrants")
.then(r => console.log(r.status, r.headers.get('location'), r.url))
.catch(console.error)
