const axios = require('axios');
const fs = require('fs');
const csv = require('csvtojson');

const quantumURL = 'http://wsrest.activarpromo.com/api/';
const headers = {
    'Content-Type': 'application/json',
    'user': 'lealtest',
    'token': 'JDGet45*Qopte32-6'
};
let quantumCities = require('./files/quantum_cities.json');
let count = 0;

(async () => {
    try {
        // Get all brands
        let brands = require('./files/quantum_brands.json');
        if(brands.length === 0) {
            const brandsResponse = await getBrands();
            brands = brandsResponse.data.response.message;
            saveData('./files/quantum_brands.json', brands);
            await delay(5000);
        }
        console.log('fetch all brands done!');

        // Get all deps for each brand
        let deps = require('./files/quantum_deps.json');
        if(deps.length === 0) {
            const depsResponse = await Promise.all(brands.map(brand => getDeps(brand)));
            deps = removeDuplicates(depsResponse.map(dep => dep.data.response.message).flat(), 'dep_id');
            saveData('./files/quantum_deps.json', deps);
            await delay(10000);
        }
        console.log('fetch all deps done!');

        // Get all cities for each dep and brand object
        const citiesPromises = brands.map(brand => deps.map(dep => getCities(brand, dep))).flat();

        //execute all promises with delay
        if(quantumCities.length === 0){
            for (const promise of citiesPromises) {
                // if fails, try again with more delay
                await delay(500);
                // const cityResponse = await promise;
                const cityResponse = await axios.post(promise.url, promise.body, {headers: promise.headers});
                quantumCities.push(cityResponse.data.response.message);
                count++;
                console.log(count);
                quantumCities = removeDuplicates(quantumCities.flat(), 'city_id');
                await saveData('./files/quantum_cities.json', quantumCities);
            }
        }
        console.log('fetch all cities done!');

        //get leal_cities from csv file
        const lealCities = await csv().fromFile('./files/leal_cities.csv');

        // join leal_cities with quantum_cities

        const lealQuantumCities = quantumCities.map(quantumCity => {
            const lealCity = findCity(lealCities, quantumCity);
            return {
                ...quantumCity,
                leal_id_ciudad: lealCity.id_ciudad,
                leal_cod_pais: lealCity.cod_pais,
                leal_ciudad: lealCity.ciudad,
                leal_latitud: lealCity.latitud,
                leal_longitud: lealCity.longitud,
                leal_id_departamento: lealCity.id_departamento
            };
        }
        );
        await saveData('./files/leal_quantum_cities.json', lealQuantumCities);
        console.log('join leal and quantum cities done! with '+lealQuantumCities.length+' cities');
    
    } catch (error) {
        console.log(error);
        
    }
})();

function getBrands () {
    return axios.post(quantumURL+'getbrands.json',{},{headers});
};

function getDeps(brand){
    return axios.post(quantumURL+'getdeps.json', {
        "brand_id": brand.brand_id,
    },{headers});
};

function getCities(brand, dep) {
    return {url: quantumURL+'getcities.json', body:{
        "brand_id": brand.brand_id,
        "dep_id": dep.dep_id
    }, headers};
};

const removeDuplicates = (array, property) => {
    return array.filter((a, b) => array.findIndex(e => e[property] === a[property]) === b && a!=='[1600]Error, No existen Sitios para los datos suministrados')
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function saveData(filename, data) {
    return fs.writeFileSync(filename, JSON.stringify(data));
}

function removeAccents(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(' ').join('');
} 

function findCity(lealCities, quantumCity){
    // matchCities.push({leal: '', quantum: city.city_name});
    // saveData('./files/force_match.json', matchCities);
    let matchCities = require('./files/force_match.json');

    //first try to find city with same name
    let cityFound = lealCities.find(city => removeAccents(quantumCity.city_name) === removeAccents(city.ciudad));
    if(cityFound){ return cityFound; }

    //if not found, try to find city with same name in matchCities
    console.log('couldnt find city: '+quantumCity.city_name)
    cityFound = matchCities.find(m=>m.quantum === quantumCity.city_name);
    if(cityFound){
        console.log('I found city: '+cityFound);
        return lealCities.find(city => removeAccents(cityFound.leal) === removeAccents(city.ciudad));
    } else {
        // console.log('couldnt find city: '+quantumCity.city_name)
        return {id_ciudad: '', cod_pais: '', ciudad: '', latitud: '', longitud: '', id_departamento: ''};
    }
}