#!/usr/bin/env perl
# User roles demo
use strict;
use warnings;

my $GREETING = "Hello";

sub is_admin {
    my ($roles) = @_;
    return grep { $_ eq "admin" } @$roles;
}

sub describe {
    my ($user) = @_;
    return sprintf("%s has %d roles", $user->{name}, scalar @{ $user->{roles} });
}

sub sum_even {
    my @nums  = @_;
    my $total = 0;
    $total += $_ for grep { $_ % 2 == 0 } @nums;
    return $total;
}

my %ada = ( name => "Ada", roles => [ "admin", "editor" ] );
print "$GREETING\n";
print describe( \%ada ), "\n";
print "evenSum: ", sum_even( 1, 2, 3, 4 ), "\n";
