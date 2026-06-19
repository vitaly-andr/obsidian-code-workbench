Feature: User login
  As a registered user
  I want to log in
  So that I can access my account

  Background:
    Given the application is running

  Scenario: Successful login
    Given a user "alice" with password "secret"
    When she submits the login form
    Then she sees the dashboard

  Scenario Outline: Invalid credentials are rejected
    Given a user "<user>"
    When she logs in with "<password>"
    Then she sees an error message
    Examples:
      | user  | password |
      | alice | wrong    |
      | bob   |          |
