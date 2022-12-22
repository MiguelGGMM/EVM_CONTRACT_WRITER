const ethers = require('ethers');
const readline = require('readline');
const { exit } = require('process');
const privateKey = require('./config.json').privateKey;

const chain_rpc = {
    "eth":"https://ethereum.publicnode.com",
    "bsc":"https://bsc-dataseed.binance.org",
    "matic":"https://polygon-rpc.com",
    "cro":"https://evm.cronos.org",
    "avax":"https://api.avax.network/ext/bc/C/rpc",
    "metis":"https://andromeda.metis.io/?owner=1088",
    "milk":"https://rpc-mainnet-cardano-evm.c1.milkomeda.com"
}

var wsProvider = undefined;
var wallet = undefined;
var coder = undefined;

var contract_call = '';
var method = '';
var parameters_types = [];
var parameters = [];
var coin_gwei_glimit = [];
var cost = 0;
var encoded_request = undefined;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const initialize = async () => {
    if(true){
        await run();
    }
    exit();
};

const run = async () => {
    try
    {
        return new Promise(resolve => { _process(); });    
    }
    catch (err)
    {
        console.log(err.toString());        
    }
};

const _process = async () => {
    try
    {
        console.log('b + ENTER to go back to previous step anytime');
        await stepGetProvider();
    }
    catch (err)
    {
        console.log(err.toString());        
    }
};

//STEPS//////////////////////////////////////////////////////////////

const stepGetProvider = async () => {
    wsProvider = undefined;
    wallet = undefined;
    step = 1;
    rl.question('\nIntroduce chain ("eth", "bsc", "matic", "cro", "avax", "metis", "milk") or RPC provider (only EVM based blockchains)\n', async (chain) => {
        if(chain_rpc[chain] != undefined || chain.startsWith("https://")){
            try{
                wsProvider = new ethers.providers.JsonRpcProvider(chain_rpc[chain] != undefined ? chain_rpc[chain] : chain);                     
                console.log(`\nConnection data:`);
                await Promise.all([
                    wsProvider.getNetwork().then((_network) => {
                        console.log(`Chain id: ${_network.chainId}`);
                    }),
                    wsProvider.getBlock().then((_block) => {
                        console.log(`Block number: ${_block.number}\nTimestamp: ${_block.timestamp} seconds`);
                    }),
                    wsProvider.getGasPrice().then((_gasPrice) => {
                        console.log(`Gas price: ${ethers.utils.formatUnits(_gasPrice, "gwei")} gwei`);
                    }),                        
                ]);        
                console.log(`\n`);                                          
            }
            catch(err){
                console.log(`Chain or RPC not supported (${chain}), error: ${err.toString()}`);
                await stepGetProvider();
            }
            try{
                wallet = new ethers.Wallet(privateKey, wsProvider);       
            }catch(err){
                console.log(`Error with provider/pk ${err.toString()}`);
                await stepGetProvider();
            }
            await stepGetContract();
        }
        else{
            console.log(`\nChain not supported (${chain})\n`);
            await stepGetProvider();
        }
    });
}

const stepGetContract = async () => {
    step = 2;
    contract_call = '';
    rl.question('\nIntroduce contract\n', async (contract) => {
        try{
            if(contract == 'b'){
                await stepGetProvider();
            }
            else
            {
                contract_call = ethers.utils.getAddress(contract);
                await stepGetMethod();
            }
        }
        catch(err){
            console.log(`\nInvalid contract address ${contract}\n`);
            await stepGetContract();
        }
    });
}

const stepGetMethod = async () => {
    step = 3;
    parameters_types =[];
    method = '';
    rl.question('\nIntroduce method, formats allowed: methodName/unknownMethodID/0xMethodID(uint256,address)\n', async (methodName) => {
        if(methodName == 'b'){
            await stepGetContract();
        }
        else
        {
            method = methodName + '';
            //Encode method or correct name
            if(method.indexOf('0x') >= 0 || method.indexOf('unknown') >= 0){
                method = method.replace('0x', '').replace('unknown', '');
                coder = undefined;
            }
            else{
                coder = new ethers.utils.AbiCoder();
            }

            //Parameters types
            parameters_types = method.split('(')[1].split(')')[0].split(',');
            if(parameters_types == undefined || (parameters_types.length == 1 && parameters_types[0] == '')){
                parameters_types = [];
            }

            await stepGetParameters();
        }
    });
}

const stepGetParameters = async () => {
    step = 4;
    parameters = [];
    rl.question(`\nIntroduce your ${parameters_types.length - parameters.length} parameters separated by ";"\n`, async (parameters_objs) => {
        if(parameters_objs == 'b'){
            await stepGetMethod();
        }
        else
        {
            parameters = parameters_objs.split(';');
            if(parameters == ''){
                parameters = [];
            }                                 
            await stepGetValueGweiGasLimit();
        }
    });
}

const stepGetValueGweiGasLimit = async () => {
    step = 5;
    coin_gwei_glimit = []; 
    rl.question(`\nIntroduce the value (amount of coin to pay BNB/CRO/AVAX.. etc), gwei and gas limit separated by ";" (BSC example: 0.1;100;2000000)\n`, async (coin) => {
        if(coin == 'b'){
            await stepGetParameters();
        }
        else
        {      
            var net_gas_price = (await wsProvider.getGasPrice() / 1000000000);
            var chunks = coin.split(';');   
            if(chunks.length == 3)
            {
                if(parseFloat(chunks[1]) >= net_gas_price)
                {
                    cost = parseFloat(chunks[0]) + (parseFloat(chunks[1]) * (parseFloat(chunks[2]) / parseFloat(1000000000)));

                    coin_gwei_glimit.push(ethers.utils.parseUnits(chunks[0], 'ether'));                  
                    coin_gwei_glimit.push(ethers.utils.parseUnits(chunks[1], 'gwei'));
                    coin_gwei_glimit.push(ethers.BigNumber.from(chunks[2]));

                    await stepConfirmExecution();
                }
                else{
                    console.log(`Your gwei is under current network gwei (${net_gas_price})`);
                    await stepGetValueGweiGasLimit();
                }
            }
            else{
                console.log('Format error');
                await stepGetValueGweiGasLimit();
            }
        }
    });
}

const stepConfirmExecution = async () => {
    step = 6;
    rl.question(`\nThis operation has a cost of ${cost.toFixed(3)} coins (max) on the chain selected, you want to proceed? (y/n) ¡¡DON'T CONTINUE IF YOU ARE NOT SURE ABOUT WHAT ARE YOU DOING!!\n`, async (yesorno) => {
        if(yesorno == 'y'){                             
            await stepPerformRequest();
        }
        else{
            await stepGetValueGweiGasLimit();
        }
    });
}

const stepPerformRequest = async () => {
    step = 7;
    try
    {
        //Encode request
        if(coder == undefined){
            coder = new ethers.utils.AbiCoder();
            encoded_request = '0x' + method.split('(')[0] + coder.encode(parameters_types, parameters).toString().substring(2);
        }
        else{
            let ABI = ['function ' + (await parseEthersAbiFormat(method, parameters_types))];
            let iface = new ethers.utils.Interface(ABI);
            encoded_request = iface.encodeFunctionData(method.split('(')[0], parameters);
        }
        console.log(`\nEncoded request:\n${encoded_request}`);    
        
        //Full request
        var request = {
            'to': contract_call,
            'data': encoded_request,
            'from': wallet.address,
            'value': coin_gwei_glimit[0],
            'gasPrice': coin_gwei_glimit[1],
            'gasLimit': coin_gwei_glimit[2]        
        };

        //Countdown
        for(var i=5; i>=1; i--){
            process.stdout.write(`Countdown...${i}        \r`);
            await sleep(1000);
        }
        console.log('');

        //Check can perform
        var stop = false;
        readline.emitKeypressEvents(process.stdin);
        process.stdin.on('keypress', (ch, key) => {
            if (key && key.ctrl && key.name == 'b') {
                stop = true;
            }
        });
        process.stdin.setRawMode(true);
        process.stdin.resume();
        var success = false;
        while(success == false){
            try{
                var estimationGas = await wsProvider.estimateGas(request);
            
                if(parseInt(estimationGas) > parseInt(coin_gwei_glimit[2])){
                    console.log(`${local_time()} - (press CTRL+b to go back) - Estimated gas too high ` + estimationGas.toString() + ` (bigger than ${coin_gwei_glimit[2].toString()}) waiting...`);            
                }
                else{
                    success = true;
                }
            }catch(err){
                console.log('(press CTRL+b to go back) ERROR: ' + err.toString());
                success = false;
                if(stop == true){
                    await stepConfirmExecution();
                    return;
                }
            }
        }

        //Send transaction
        const sent_tx = await wallet.sendTransaction(request);
        console.log(`${local_time()} - transaction sent`);
        const receipt = await sent_tx.wait();
        if(receipt.status == 1){
            console.log(`${local_time()} - SUCCESSFUL`);
        }
        else{
            console.log(`${local_time()} - REVERTED`);
        }
        console.log(`Transaction hash: ${receipt.transactionHash}`);
    }
    catch(err)
    {
        console.log('ERROR');
        console.log(err.toString());
    }
    await stepFinish();
}

const stepFinish = async () => {
    await stepConfirmExecution();
}

/////////////////////////////////////////////////////////////////////

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function parseEthersAbiFormat(method, parameters_types){
    var array_replaces = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
    var index = 0;

    for(var index in parameters_types){
        method = method.replace(parameters_types[index], parameters_types[index] + ' ' + array_replaces[index]);
    }

    return method;
}

function local_time(){
    return new Date().toLocaleTimeString('es-ES');
}

var step = 1;
//Go to previous step

(async() => {
    initialize();
})();