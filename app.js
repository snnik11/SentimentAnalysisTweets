
const express = require('express');

const TwitterRouter = require('./src/routes/twitteranalysis');
const app = express();
app.use(express.urlencoded({extended: true}));

const port = 3002;

//Static Files
app.use(express.static('public'));
app.use('/css', express.static(__dirname + 'public/css'))
app.use('/img', express.static(__dirname + 'public/img'))
app.use('/js', express.static(__dirname + 'public/js'))

app.set('views', './src/views')
app.set('view engine', 'ejs')

app.use('/', TwitterRouter);

//Listen on port 3000
app.listen(port, function () {
    console.log(`Listening at ${port}`);
});
