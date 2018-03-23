var express = require('express');
var sequelize = require('sequelize');
var md5 = require('md5');
var json2csv = require('json2csv').parse;
var models = require('../models');
var socketapi = require('../socketapi');
var login_required = require('./middlewares').login_required;
var router = express.Router();

function get_md5_hash(challenge_name, level, homedir)
{
    return md5('i' + challenge_name + 'j%!d(string=' + level + ')k' + homedir + 'l');
}

function my_upsert(model, values, condition)
{
    return model
        .findOne({ where: condition })
        .then(function(obj) {
            if(obj)
                return obj.update(values);
            else
                return model.create(values);
        });
}

function get_point_mapping(pointmap, exid) {
    var mapping = [];
    for (var i = 0; i < pointmap.levels.length; i++) {
        if (pointmap.levels[i] != '' && pointmap.points[i] != '') {
            mapping.push({
                level: pointmap.levels[i],
                points: pointmap.points[i],
                is_bonus: pointmap.is_bonus[i] == 'on' ? 1 : 0,
                exercise_id: exid
            });
        }
    }

    return mapping;
}

function validate_exercise(req)
{
    req.checkBody('id', 'The id of the exercise required').notEmpty();
    req.checkBody('starts_at', 'The date and time of exercise start required').notEmpty();
    req.checkBody('ends_at', 'The date and time of exercise finish required').notEmpty();

    req.sanitize('name').escape();
    req.sanitize('name').trim();

    req.sanitize('last_level').escape();
    req.sanitize('last_level').trim();

    return req;
}

router.get('/create', login_required, function(req, res, next) {
    res.render('create_exercise', { header: 'Create Exercise' });
});

router.post('/create', login_required, function(req, res, next) {
    req = validate_exercise(req);

    var errors = req.validationErrors();

    if (errors) {
        res.render('create_exercise', { header: 'Create Exercise', errors: errors});
        return;
    } else {
        var data = {name: req.body.name, id: req.body.id,
                    last_level: req.body.last_level,
                    starts_at: req.body.starts_at,
                    ends_at: req.body.ends_at,};
        models.Exercise.create(data).then(function(exercise) {
            models.Pointmap.bulkCreate(get_point_mapping(req.body.pointmap, exercise.id)).then(function() {
                models.Exercise.findAll().then(function(resultset) {
                    req.app.locals.navbar_exercises = resultset;

                    var data = exercise.dataValues;
                    var msg = 'Exercise ' + data.name + ' #' + data.id + ' created';
                    req.flash('success', msg);
                    res.redirect('/');
                });
            });
        }).catch(function(err) {
            res.render('create_exercise', { header: 'Create Exercise',
                                            errors: [ {msg: 'Something went wrong with database (check exercise ID is unique)'} ]});
        });
    }
});

router.get('/edit/:exercise_id', login_required, function(req, res, next) {
    models.Exercise.findOne({
        where: {
            id: req.params.exercise_id,
        }
    }).then(function(exercise) {
        if (!exercise)
            next();

        models.Pointmap.findAll({
            where: {
                exercise_id: exercise.id
            }
        }).then(function(pointmaps){
            res.render('edit_exercise', {header: 'Edit Exercise', exercise: exercise,
                                         pointmaps: pointmaps});
        });
    });
});

router.post('/edit/:exercise_id', login_required, function(req, res, next) {
    req = validate_exercise(req);

    var errors = req.validationErrors();

    if (errors) {
        models.Exercise.findOne({
            where: {
                id: req.params.exercise_id,
            }
        }).then(function(exercise) {
            res.render('edit_exercise', { header: 'Edit Exercise', exercise: exercise, errors: errors});
            return;
        });
    } else {
        var data = {name: req.body.name, id: req.body.id,
                    last_level: req.body.last_level,
                    status: req.body.status, starts_at: req.body.starts_at,
                    ends_at: req.body.ends_at};
        models.Exercise.update(data, {
            where: {
                id: req.params.exercise_id
            }
        }).then(function(exercise) {
            models.Pointmap.findAll({
                where: {
                    exercise_id: req.params.exercise_id
                }
            }).then(function(pointmaps) {
                var promises = [];
                var levels = req.body.pointmap.levels;
                var mapping = get_point_mapping(req.body.pointmap, req.params.exercise_id,);
                for (var i = 0; i < pointmaps.length; i++) {
                    if (!(levels.indexOf(pointmaps[i].level) > -1))
                        promises.push(pointmaps[i].destroy());
                }
                for (var i = 0; i < mapping.length; i++) {
                    promises.push(my_upsert(models.Pointmap, mapping[i], { exercise_id: req.params.exercise_id, }));
                }

                Promise.all(promises).then(function(result) {
                    models.Exercise.findAll().then(function(resultset) {
                        req.app.locals.navbar_exercises = resultset;
                        req.app.locals.navbar_evaluate_exercises = [];
                        resultset.forEach(function(item) {
                            if (item.status == 'done')
                                req.app.locals.navbar_evaluate_exercises.push(item);
                        });

                        var msg = 'Exercise ' + data.name + ' #' + data.id + ' updated';
                        req.flash('success', msg);
                        res.redirect('/');
                    });
                });
            });
        }).catch(function(err) {
            models.Exercise.findOne({
                where: {
                    id: req.params.exercise_id,
                }
            }).then(function(exercise) {
                res.render('edit_exercise', { header: 'Edit Exercise',
                                              exercise: exercise,
                                              errors: [ {msg: 'Something went wrong with database (check exercise ID is unique)'} ]});
            });
        });
    }
});

router.get('/active', login_required, function(req, res, next) {
    models.Exercise.findOne({
        where: {
            status: 'active',
        }
    }).then(function(exercise) {
        models.Hall.findOne({
            where: {
                user_id: req.user.id
            }
        }).then(function(hall) {
            if (!hall)
                hall = "{}";
            else
                hall = hall.positions;

            res.render('active_exercise', {header: 'Active Exercise', exercise: exercise,
                                           hall: hall, inactivity_time: global.inactivity});
        });
    });
});

router.post('/active/save', login_required, function(req, res, next) {
    var data = JSON.stringify(req.body);
    models.Hall.findOne({
        where: {
            user_id: req.user.id
        }
    }).then(function(hall) {
        if (hall) {
            models.Hall.update({positions: data}, {
                where: {
                    user_id: req.user.id
                }
            }).then(function(hall) {
                res.json({success : true, message: 'Updated Successfully', status : 200});
            });
        } else {
            models.Hall.create({user_id: req.user.id, positions: data}).then(function(hall) {
                res.json({success : true, message: 'Created Successfully', status : 200});
            });
        }
    });
});

router.get('/evaluate/:exercise_id', login_required, function(req, res, next) {
    models.Exercise.findById(req.params.exercise_id).then(function(exercise) {
        models.Post.findAll({
            where: {
                exercise_id: exercise.id
            }
        }).then(function(resultset_posts) {
            models.Evaluate.findAll({
                where: {
                    exercise_id: exercise.id
                }
            }).then(function(resultset_evals) {
                models.Alternative.findAll({
                    attributes: ['user', 'alternative']
                }).then(function(resultset_alters){
                    var posts = resultset_posts.map(function(post) { return post.dataValues; });
                    var evals = resultset_evals.map(function(eval) { return eval.dataValues; });
                    var alters = resultset_alters.map(function(alter) { return alter.dataValues; });
                    res.render('evaluate_exercise', { header: 'Evaluate Exercise',
                                                      modal_evaluate: true,
                                                      exercise: exercise,
                                                      posts: JSON.stringify(posts),
                                                      evals: JSON.stringify(evals),
                                                      alternatives: JSON.stringify(alters)});
                })
            });
        });
    });
});

router.post('/evaluate/:exercise_id', login_required, function(req, res, next) {
    var user = req.body.user;
    var score = req.body.score;
    var bonus = req.body.bonus;
    var comment = req.body.comment;
    var exercise_id = req.params.exercise_id;
    var user_id = req.user.id;

    models.Evaluate.findOne({
        where: {
            exercise_id: exercise_id,
            user: user
        }
    }).then(function(evaluation) {
        if (evaluation) {
            evaluation.update({
                user_id: user_id,
                score: score,
                bonus: bonus == '' ? 0 : bonus,
                comment: comment
            }).then(function() {
                return res.json({message: 'Updated Successfully', status : 200});
            }).catch(function(err) {
                return res.status(500).json({message: err.errors[0].message, status: 500});
            });
        } else {
            models.Evaluate.create({
                user: user,
                score: score,
                bonus: bonus == '' ? 0 : bonus,
                comment: comment,
                exercise_id: exercise_id,
                user_id: user_id
            }).then(function(ev) {
                return res.json({message: 'Created Successfully', status : 200});
            }).catch(function(err) {
                return res.status(500).json({message: err.errors[0].message, status: 500});
            });
        }
    }).catch(function(err) {
        return res.status(500).json({message: 'Failed to save', status : err.code});
    });
});

router.get('/evaluate/:exercise_id/csvexport', login_required, function(req, res, next) {
    var fields = ['username', 'grade', 'bonus', 'comment'];

    models.Evaluate.findAll({
        where: {
            exercise_id: req.params.exercise_id
        },
        attributes: [['user', 'username'], ['score', 'grade'], 'bonus', 'comment']
    }).then(function(resultset) {
        models.Alternative.findAll({
            attributes: ['user', 'alternative']
        }).then(function(resultset_alters) {
            var alters = {};
            for (var i = 0; i < resultset_alters.length; i++) {
                alters[resultset_alters[i].user] = resultset_alters[i].alternative;
            }

            var data = resultset.reduce(function(result, ev) {
                ev = ev.get({ plain: true });
                if (ev.username in alters)
                    ev.username = alters[ev.username];

                if (ev.username != global.EXCLUDE_NAME)
                    result.push(ev);

                return result;
            }, []);

            if (data.length == 0) {
                return res.status(204).send();
            }

            var csv = json2csv(data, { fields, quote: '' });
            res.attachment('score.csv');
            res.status(200).send(csv);
        });
    });
});

router.post('/evaluate/:exercise_id/auto', login_required, function(req, res, next) {
    models.Exercise.findOne({
        where: {
            id: req.params.exercise_id
        }
    }).then(function(exercise) {
        if (!exercise || !exercise.max_points)
            return res.status(404).send();

        models.Post.findAll({
            where: {
                exercise_id: exercise.id,
                type: global.POST_EXIT
            }
        }).then(function(resultset) {
            var grades = {};
            resultset.forEach(function(item) {
                var success_hash = get_md5_hash(exercise.name, exercise.last_level, item.homedir)
                var users_hash = item.hash;

                if (success_hash == users_hash)
                    grades[item.user] = exercise.max_points;
                else if (item.user in grades)
                    delete grades[item.user];
            });

            var promises = [];
            for (user in grades) {
                promises.push(my_upsert(models.Evaluate,
                                        {user: user, score: grades[user],
                                         exercise_id: exercise.id, user_id: req.user.id},
                                        {user: user, exercise_id: exercise.id}));
            }

            Promise.all(promises).then(function(result) {
                var results = result.map(function(r) { return {user: r.user, score: r.score}});
                res.json({success: true, message: 'Evaluated Successfully',
                          status: 200, data: results});
            }).catch(function(err) {
                res.json({success: false, message: err, status : 500});
            });
        });
    });
});

router.post('/evaluate/alternative/set', login_required, function(req, res, next) {
    var user = req.body.user;
    var alternative = req.body.alternative;

    if (alternative == '') {
        models.Alternative.findOne({
            where: {
                user: user
            }
        }).then(function(alter) {
            alter.destroy();
        }).then(function() {
            res.json({success : true, message: 'Destroyed Successfully', status : 200})
        }).catch(function(err) {
            res.json({success : false, message: err, status : 500})
        });
    } else {
        my_upsert(models.Alternative,
                  {user: user, alternative: alternative},
                  {user: user}).then(function(result) {
            res.json({success : true, message: 'Updated Successfully', status : 200})
        }).catch(function(err) {
            res.json({success : false, message: err, status : 500})
        });
    }
});

/* if this event is called, active exercise exists */
socketapi.io.on('connect', function(socket) {
    models.Exercise.findOne({
        where: {
            status: 'active',
        },
        attributes: ['id']
    }).then(function(exercise) {
        if (exercise) {
            models.Post.findAll({
                where: {
                    exercise_id: exercise.id
                }
            }).then(function(resultset){
                models.Alternative.findAll({
                    attributes: ['user', 'alternative']
                }).then(function(alternatives) {
                    socket.emit('load_active_exercise', resultset, alternatives);
                });
            });
        }
    });
});

module.exports = router;
