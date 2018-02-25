function Evaluate(user)
{
    this.user = user;
    this.score = null;
    this.comment = '';
}

Evaluate.prototype.set_score = function(score) {
    this.score = score;
}

Evaluate.prototype.update_score = function() {
    $('#student-' + this.user + ' .score-cell').text(this.get_score_or_dash());
}

Evaluate.prototype.get_score_or_dash = function() {
    return this.score == null ? '-' : this.score;
}

Evaluate.prototype.get_score = function() {
    return this.score == null ? '' : this.score;
}

Evaluate.prototype.set_comment = function(comment) {
    this.comment = comment;
}

Evaluate.prototype.get_comment = function() {
    return this.comment;
}