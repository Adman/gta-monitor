function Exercise()
{
    this.number;
    this.students = {};
    this.all = 0;
    this.finished = 0;
    this.positions = {};

    for (var key in HALL_INITIAL) {
        this.positions[key] = new Position(HALL_INITIAL[key][0],
                                           HALL_INITIAL[key][1]);
    }
}

Exercise.prototype.create_student_and_add_post = function(post) {
    if (!(post.user in this.students)) {
        this.students[post.user] = new Student(post.user, post.hostname, post.ip);
        this.all++;
    }
    this.students[post.user].add_post(post);
}

Exercise.prototype.initialize_students = function(posts) {
    for(var i = 0; i < posts.length; i++) {
        this.create_student_and_add_post(posts[i]);
        if (posts[i].type == 'exit')
            this.finished++;
    }

    for(var user in this.students) {
        this.create_new_box(this.students[user]);
    }

    this.update_started_students();
    this.update_finished_students();
}

Exercise.prototype.move_away_occupied = function(pos, student) {
    $('#student-' + pos.user).appendTo('#active-exercise-students');
    $('#student-' + pos.user).css({'position': 'relative', 'top': 0, 'left': 0});

    if (!(this.students[pos.user].exit)) {
        /* if student hard quit, add grey bg color */
        $('#student-' + pos.user).removeClass('bg-primary').removeClass('bg-success').addClass('bg-secondary');
    }
}

/* TODO: divide this into multiple methods */
Exercise.prototype.create_new_box = function(student) {
    var style = '';

    if (this.position_exists(student.hostname) && !student.exit) {
        var pos = this.positions[student.hostname];
        if (pos.occupied && pos.user != student.user) {
            this.move_away_occupied(pos, student);
        }
        this.positions[student.hostname].set_occupy(student.user);
        style = ' style="position:absolute; top:' + pos.top + 'px; left:' + pos.left + 'px;"';
    }

    var box = '<div class="' + student.get_box_background() + ' text-white user-box" id="student-' + student.user + '" data-username="' + student.user
                    + '" data-hostname="' + student.hostname + '"' + style + '>'
            +   '<div class="user-box-info">'
            +     '<span class="user-box-user">' + student.get_name_hostname() + '</span>'
            +     '<span>Level: <span class="user-box-level">' + student.level + '</span></span>'
            +   '</div>'
            +   '<div class="user-box-command-info">$ '
            +     '<span class="user-box-command">' + student.get_last_command() + '</span>'
            +   '</div>'
            + '</div>';

    if (this.position_exists(student.hostname) && !student.exit)
        $('#active-exercise-hall').append(box);
    else if (student.exit)
        $('#active-exercise-students').append(box);
    else
        $('#active-exercise-students').prepend(box);
    /* TODO: check if we cannot bind just the created box */
    bind_draggables();
}

Exercise.prototype.position_exists = function(hostname) {
    return hostname in this.positions;
}

Exercise.prototype.new_post = function(post) {
    var is_existing_student = (post.user in this.students);
    this.create_student_and_add_post(post);

    var student = this.students[post.user];
    switch (post.type) {
        case 'start':
            if (!is_existing_student) {
                this.create_new_box(student);
                this.update_started_students();
            } else {
                /* user restarted the exercise and/or changed computer */
                if (post.hostname != student.hostname) {
                    var oldhostname = student.hostname;

                    /* update new info about student */
                    this.students[post.user].change_computer(post.hostname, post.ip);

                    /* if the new position is occupied by someone else, replace */
                    if (this.position_exists(post.hostname)) {
                        if (this.positions[post.hostname].user != post.user) {
                            this.move_away_occupied(this.positions);
                            this.positions[student.hostname].set_occupy(student.user);
                        }
                    }

                    /* unoccupy the position where student was previously placed */
                    if (this.position_exists(oldhostname))
                        this.positions[oldhostname].remove_occupy();
                } else {
                    if (this.position_exists(student.hostname)) {
                        /* if student is in upper container, move them to hall */
                        if (this.positions[student.hostname].user != student.user) {
                            var pos = this.positions[student.hostname];
                            $('#student-' + student.user).appendTo('#active-exercise-hall');
                            $('#student-' + student.user).css({'position': 'relative', 'top': pos.top, 'left': pos.left});
                            pos.set_occupy(student.user);
                        }
                    }
                }
            }
            break;
        case 'exit':
            /* TODO: check if we need to remove other bg-xxx classes in the future */
            $('#student-' + post.user).removeClass('bg-primary').addClass('bg-success');
            this.finished++;
            this.update_finished_students();
            break;
        case 'command':
            $('#student-' + post.user + ' .user-box-command').text(post.command);
            break;
        case 'passed':
            $('#student-' + post.user + ' .user-box-level').text(student.level);
            break;
    }
}

Exercise.prototype.update_started_students = function() {
    $('#active-exercise-students-all').text(this.all);
}
Exercise.prototype.update_finished_students = function() {
    $('#active-exercise-students-finished').text(this.finished);
}

var exercise = new Exercise();

$(document).on('click', '#btn-save-positions', function(e) {
    $.ajax({
        url: '/exercise/active/save',
        dataType: 'json',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(exercise.positions),

        success: function(data, textStatus, jQxhr){

        },
        error: function( jqXhr, textStatus, errorThrown ){
            alert('Failed to save data.');
        }
    });
});

socket.on('load_active_exercise', function(posts, inactive) {
    exercise.initialize_students(posts);
    for (var i = 0; i < inactive.length; i++) {
        exercise.students[inactive[i]].update_activity(false);
    }
});

socket.on('new_post', function(post) {
    exercise.new_post(post);
});

socket.on('new_inactive_student', function(username) {
    exercise.students[username].update_activity(false);
});

socket.on('new_active_student', function(username) {
    exercise.students[username].update_activity(true);
});
