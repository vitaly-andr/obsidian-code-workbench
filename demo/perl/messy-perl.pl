use strict;
use warnings;

# error: the subroutine body { is never closed
sub sum_even {
    my @nums  = @_;
    my $total = 0;
    $total += $_ for @nums;
    return $total;

print sum_even( 1, 2, 3, 4 ), "\n";
