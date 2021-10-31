const express = require('express');
const aposToLexForm = require('apos-to-lex-form');
const natural = require('natural');
const SpellCorrector = require('spelling-corrector');
const SW = require('stopword');
require('dotenv').config();
const AWS = require('aws-sdk');
// Cloud Services Set-up
// Create unique bucket name
const bucketName = '10498745-twitterbucket';
//Create a promise on S3 service object
const bucketPromise = new AWS.S3({apiVersion: '2006-03-01'}).createBucket({Bucket: bucketName}).promise();
bucketPromise.then(function(data) {
console.log("Successfully created " + bucketName);
})
.catch(function(err) {
console.error(err, err.stack);
});

//Redis cache

const redis = require('redis');
const redisClient = redis.createClient();
redisClient.on('error', (err) => {
    console.log("Error " + err);
    });




const needle = require('needle');
const token = "AAAAAAAAAAAAAAAAAAAAAB6eTgEAAAAA6CoC3oKLa5uVcPHL9w6pKDkORJw%3DXmwiWNlQPV3NM7MTfBNaIsUKuumB8Y2c5DC0UQBMSFEAhzeWfF";
const endpointUrl = " https://api.twitter.com/2/tweets/search/recent";


const router = express.Router();
//const axios= require('axios');

const spellCorrector = new SpellCorrector();
spellCorrector.loadDictionary();

async function TweetAnalysis(search)
{

    try{

   
    //Calling twitter API
   console.log("in here 1")
    let response2;
        const params = {
                 'query': search.trim(),
                  'max_results': 100,
                  'tweet.fields': 'lang'
                }
        response2 = await needle('get', endpointUrl, params, {
                                headers: {
                                    "User-Agent": "v2RecentSearchJS",
                                    "authorization": `Bearer ${token}`
                                }
                            })

                            //console.log(response2.body)

                        
            let json2= await response2.body;
            console.log("in here 2")
            //console.log(json2.data)
            //MAking key
            
            if (json2.data){
            return {
                tweets: json2.data,
                    }
                }
                else{
                    return null;
                }
       
    }
    catch(err){console.error(err);}
}
function Analyser(results) {

    let plotAnalysisData = [];
    let totalWeight= 0;
    //COMMENT FOR TESTING
   // for(let j =1; j <= 10; j++ ) 
   // {
     for (let i =0; i< results.tweets.length;i++)  
        {
                if(results.tweets[i].lang = "en")
                {
                        //analysis of tweets
                        console.log("in here 3")
                      
                        const  tweet = results.tweets[i].text;
                       
                        const lexedTweet = aposToLexForm(tweet);
                        
                       
                        const casedTweet =  lexedTweet.toLowerCase();
                        const alphaOnlyTweet = casedTweet.replace(/[^a-zA-Z\s]+/g, '');
                    
                        const { WordTokenizer } = natural;
                        const wordToken = new WordTokenizer();
                        const tokenizedTweet= wordToken.tokenize(alphaOnlyTweet);
                    
                        tokenizedTweet.forEach((word, index) => {
                        tokenizedTweet[index] = spellCorrector.correct(word);
                        })
                        const filteredTweet = SW.removeStopwords(tokenizedTweet);
                        const { SentimentAnalyzer, PorterStemmer } = natural;
                        const analyzeSentiment = new SentimentAnalyzer('English', PorterStemmer, 'afinn');
                        const analysis = analyzeSentiment.getSentiment(filteredTweet);
                        console.log(analysis)

                        //storing analysis in array for plot
                        plotAnalysisData.push({x: 0, y: analysis})

                        //For getting avg emotions
                        totalWeight = totalWeight+ analysis;
                }

       // }   
    }
    totalWeight = Math.round(totalWeight);
    let avgWeight = totalWeight /((results.tweets.length) ); 
    console.log("avgWeight");
    console.log(avgWeight);
    //Check Avg Emotion for all the tweets of that topic
    let avgEmo = "";
    if (avgWeight < 0) {
        avgEmo = "Negative"
       };
    if (avgWeight === 0) {
        avgEmo = "Neutral"
         }
    if (avgWeight > 0) {
        avgEmo = "Positive"
    }
    return { plotAnalysisData: plotAnalysisData , avgEmo: avgEmo };

}

router.post('/', async(req, res) => {
  
   

    try{

        let search = req.body.search;
        search = search.replace(/[^a-zA-Z ]/g, "").split(' ').join('%').substring(0,450);
        console.log("The search param  ",search);
        const redisKey = `TweetTopic:${search.trim()}`;

        //return from redis 
        
        return redisClient.get  (redisKey, (err  , result) => 
        { 
            if  (result) { 
                //  Serve from    Cache
                const resultJSONRedis = JSON.parse(result);  
                console.log("result from cache for query ", search);
                //Call Analyser
                let analysedResults = Analyser(resultJSONRedis);
                res.render('tweetSearch', {searchParam: req.body.search, tweets: resultJSONRedis.tweets, analysis: JSON.stringify(analysedResults.plotAnalysisData), avgemotion: analysedResults.avgEmo});

            }
            else    {  

                 // Check S3            
                const s3Key = `TweetTopic:${search.trim()}`;
                console.log("The s3query is: ", s3Key);
                const params = { Bucket: bucketName, Key: s3Key};
                return new AWS.S3({apiVersion: '2006-03-01'}).getObject(params, (err, resul) => {
                 if (resul) {
                 // Serve from S3
                    
                     const resultJSON = JSON.parse(resul.Body);
                   
                     redisClient.setex(redisKey, 3600, JSON.stringify(resultJSON) );
                    
                     console.log("Stored in redis cache returning from S3");
                   
                     let analysedResults = Analyser(resultJSON);
                     res.render('tweetSearch', {searchParam: req.body.search, tweets: resultJSON.tweets, analysis: JSON.stringify(analysedResults.plotAnalysisData), avgemotion: analysedResults.avgEmo});
     
                 } 
                else {
                    TweetAnalysis(search.trim())
                    .then(results => {
                       
                      if(results != null || results != undefined){
            
                        //Storing results in redis cache and s3 bucket
                        console.log("In call");
                        console.log(results)
                        //redis
                        redisClient.setex(redisKey, 3600, JSON.stringify(results) );
            
                        //s3
                        const body = JSON.stringify(results);
                       const objectParams = {Bucket: bucketName, Key: s3Key, Body: body};
                        const uploadPromise = new AWS.S3({apiVersion: '2006-03-01'}).putObject(objectParams).promise();
                        uploadPromise.then(function(data) {
                         console.log("Successfully uploaded data to " + bucketName + "/" + s3Key);
                         });
                        
                       let analysedResults = Analyser(results);
                       res.render('tweetSearch', { searchParam: req.body.search, tweets: results.tweets, analysis: JSON.stringify(analysedResults.plotAnalysisData), avgemotion: analysedResults.avgEmo});
                      }
                       else{
                     res.render('tweetSearch', {searchParam: req.body.search, tweets: "No search results found! Try again.",analysis: "No search results found.",avgemotion: "No search results found."});
                       }
                    }
                    ).
                    catch(err => console.error(err));



                  }
                     });



               
            }

        });

    } 
    catch(err){ 
        console.error(err);
        console.log(err.response.data);
    }
});


router.get('/', async(req, res) => {

    try{


     res.render('tweetSearch', {tweets: null});

    } 
    catch(err){ 
        console.error(err);
        console.log(err.response.data);
    }
});



module.exports = router;
