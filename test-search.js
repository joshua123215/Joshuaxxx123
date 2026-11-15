const axios = require('axios');
async function run() {
    const query = "Pirates 2005";
    let results = [];
      
    // 1. If it's an IMDB ID
    if (/^tt\d+$/i.test(query)) {
    const idRes = await axios.get(`https://www.omdbapi.com/?i=${query}&apikey=thewdb`);
    if (idRes.data.Response === "True") {
        results.push(idRes.data);
    }
    } else {
    // Try extracting year if query ends with 4 digits e.g. "Pirates 2005"
    let titleQuery = query;
    let yearQuery = "";
    const yearMatch = query.match(/^(.*?)\s+(\d{4})$/);
    if (yearMatch) {
        titleQuery = yearMatch[1];
        yearQuery = `&y=${yearMatch[2]}`;
    }
    
    // Parallel requests: Search (s=) and Exact Title (t=)
    const [searchRes, exactRes] = await Promise.allSettled([
        axios.get(`https://www.omdbapi.com/?s=${encodeURIComponent(titleQuery)}${yearQuery}&apikey=thewdb`),
        axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(titleQuery)}${yearQuery}&apikey=thewdb`)
    ]);
    
    if (exactRes.status === "fulfilled" && exactRes.value.data.Response === "True") {
        results.push(exactRes.value.data);
    }
    
    if (searchRes.status === "fulfilled" && searchRes.value.data.Response === "True") {
        results = [...results, ...searchRes.value.data.Search];
    }
    }

    console.log(results.map(m => m.Title + ' (' + m.Year + ')'));
}
run();
