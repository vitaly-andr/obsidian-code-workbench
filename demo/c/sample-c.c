// User roles demo
#include <stdio.h>
#include <string.h>

#define MAX_ROLES 8

typedef struct {
    const char *name;
    const char *roles[MAX_ROLES];
    int role_count;
} User;

int is_admin(const User *user) {
    for (int i = 0; i < user->role_count; i++) {
        if (strcmp(user->roles[i], "admin") == 0) {
            return 1;
        }
    }
    return 0;
}

int sum_even(const int *nums, int n) {
    int total = 0;
    for (int i = 0; i < n; i++) {
        if (nums[i] % 2 == 0) {
            total += nums[i];
        }
    }
    return total;
}

int main(void) {
    User ada = {"Ada", {"admin", "editor"}, 2};
    int nums[] = {1, 2, 3, 4};
    printf("%s admin=%d evenSum=%d\n", ada.name, is_admin(&ada), sum_even(nums, 4));
    return 0;
}
