const querystring = require('querystring');
const https = require('https');
const AWS = require('aws-sdk');


const dynamoDb = new AWS.DynamoDB.DocumentClient()

const zohoTokenUrls = [
  {
    Location: "us",
    ServerLocation: "https://accounts.zoho.com",
    TokenURL: "https://accounts.zoho.com/oauth/v2/token"
  },
  {
    Location: "eu",
    ServerLocation: "https://accounts.zoho.eu",
    TokenURL: "https://accounts.zoho.eu/oauth/v2/token"
  },
  {
    Location: "India",
    ServerLocation: "https://accounts.zoho.in",
    TokenURL: "https://accounts.zoho.in/oauth/v2/token"
  },
  {
    Location: "Australia",
    ServerLocation: "https://accounts.zoho.com.au",
    TokenURL: "https://accounts.zoho.com.au/oauth/v2/token"
  },
  {
    Location: "China",
    ServerLocation: "https://accounts.zoho.com.cn",
    TokenURL: "https://accounts.zoho.com.cn/oauth/v2/token"
  }
];

function getTokenUrlByServerLocation(inputServerLocation) {
  const formattedInput = inputServerLocation.toLowerCase().replace(/\s/g, '');
  const matchingEntry = zohoTokenUrls.find(entry => 
    entry.ServerLocation.toLowerCase().replace(/\s/g, '') === formattedInput
  );
  return matchingEntry ? matchingEntry : null;
}



const clientId = process.env.CLIENT_ID;
const clientSecret =process.env.CLIENT_SECRET;
const redirectUri =process.env.REDIRECT_URI;

exports.handler = async (event) => {
    const path = event.requestContext.http.path;
    const httpMethod = event.requestContext.http.method;
 

    if (path === '/') {
    const email = event.queryStringParameters.email;
    const uid = event.queryStringParameters.uid;

        return {
            statusCode: 200,
            headers: { "Content-Type": "text/html" },
            body: `<h1>Welcome to the App</h1><p>User: ${email}, UID: ${uid}</p><a href="/start-auth?email=${encodeURIComponent(email)}&uid=${encodeURIComponent(uid)}">Login with Zoho</a>`
        };
    } else if (path === '/start-auth') {
        const email = event.queryStringParameters.email;
        const uid = event.queryStringParameters.uid;
        const app_redirect = event.queryStringParameters.url;
        const oauth_scope = event.queryStringParameters.scope
        const CLIENT_ID = clientId;
        const REDIRECT_URI = redirectUri;
        const zohoAuthUrl = `https://accounts.zoho.com/oauth/v2/auth?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${oauth_scope}&access_type=offline&state=${encodeURIComponent(JSON.stringify({ email, uid,app_redirect }))}`;

        return {
            statusCode: 302,
            headers: { "Location": zohoAuthUrl }
        };
    } else if (path === '/oauth/callback') {
      try {
        console.log(event.queryStringParameters)
        const code = event.queryStringParameters.code;
        const state = event.queryStringParameters.state;
        const location = event.queryStringParameters.location;
        const accServer = event.queryStringParameters["accounts-server"];

        console.log(state)
        const tokenUrl=getTokenUrlByServerLocation(accServer)
        const codes= await exchangeCodeForTokens(code,clientId,clientSecret,redirectUri,tokenUrl.TokenURL)
        // console.log(codes)
        const currentTime = Math.floor(Date.now() / 1000);
        const expiresIn = codes.expires_in;
        const accessTokenExpireTime = new Date((currentTime + expiresIn) * 1000);

        const payload={
          email:JSON.parse(state).email,uid:JSON.parse(state).uid,location,account_server:accServer,tokens:codes,access_token_expire_time: accessTokenExpireTime
        }
        const storeTheTokens=await storeOrUpdatePayloadInDB(payload)
        return {
            statusCode: 302,
            headers:{
              "Location":JSON.parse(state).app_redirect,
            }
        };
        
      } catch (e) {
        console.log(e)
        return {
            statusCode: 500,
            body: JSON.stringify({err:e})
        };}
    } else {
        // Not Found
        return {
            statusCode: 404,
            body: 'Not Found'
        };
    }
};

function exchangeCodeForTokens(code, clientId, clientSecret, redirectUri, tokenUrl) {
  const postData = querystring.stringify({
    code: code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'ZohoMail.accounts.READ,ZohoMail.messages.ALL'
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(tokenUrl, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          resolve(parsedData);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

function makeHttpsPostRequest(hostname, path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });

    req.on("error", (e) => {
      reject(e);
    });

    req.write(JSON.stringify(data));
    req.end();
  });
}
async function storeOrUpdatePayloadInDB(payload) {
 try {
   console.log("Writing")
  const writeData=await makeHttpsPostRequest("destination","/",payload);
  console.log(writeData)
  return "success";
 } catch (e) {
   console.log(e)
   return e;
 }
}
