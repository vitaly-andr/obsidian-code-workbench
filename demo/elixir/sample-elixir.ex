# User roles demo
defmodule Sample do
  defmodule User do
    defstruct name: "", roles: []
  end

  def admin?(%User{roles: roles}), do: "admin" in roles

  def describe(%User{name: name, roles: roles}) do
    "#{name} has #{length(roles)} roles"
  end

  def sum_even(nums) do
    nums
    |> Enum.filter(&(rem(&1, 2) == 0))
    |> Enum.sum()
  end

  def run do
    users = [
      %User{name: "Ada", roles: ["admin", "editor"]},
      %User{name: "Bob", roles: ["viewer"]}
    ]

    IO.puts(describe(hd(users)))
    IO.puts("evenSum: #{sum_even([1, 2, 3, 4])}")
  end
end
