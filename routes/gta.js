var express = require('express');
var router = express.Router();

/* POST from GTA application. */
router.post('/', function(req, res) {
    console.log('GOT POST');
    console.log(req.body);

    res.status(200).send();
});

module.exports = router;
