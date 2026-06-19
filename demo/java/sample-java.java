// User roles demo
import java.util.List;
import java.util.Arrays;

public class Sample {
    record User(String name, List<String> roles) {
        boolean isAdmin() {
            return roles.contains("admin");
        }
    }

    static String describe(User user) {
        return user.name() + " has " + user.roles().size() + " roles";
    }

    static int sumEven(int[] nums) {
        int total = 0;
        for (int n : nums) {
            if (n % 2 == 0) {
                total += n;
            }
        }
        return total;
    }

    public static void main(String[] args) {
        User ada = new User("Ada", Arrays.asList("admin", "editor"));
        System.out.println(describe(ada) + " admin=" + ada.isAdmin());
        System.out.println("evenSum: " + sumEven(new int[] {1, 2, 3, 4}));
    }
}
