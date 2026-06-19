// error: the sum_even function body is missing its closing brace }
int sum_even(const int *nums, int n) {
    int total = 0;
    for (int i = 0; i < n; i++) {
        total += nums[i];
    }
    return total;

int main(void) { return 0; }
