<?php
// error: the class body is missing its closing brace }
class User
{
    public function isAdmin(): bool
    {
        return in_array("admin", $this->roles, true);
    }

echo "done";
